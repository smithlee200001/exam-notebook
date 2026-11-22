import io
import json

from PIL import Image
import pytest

import codex_ocr
from app import create_app


def png():
    out = io.BytesIO()
    Image.new('RGB', (20, 20), 'white').save(out, format='PNG')
    return out.getvalue()


def test_missing_config_and_status_no_launch(tmp_path, monkeypatch):
    monkeypatch.setattr(codex_ocr.subprocess, 'Popen', lambda *a, **k: pytest.fail('unexpected process'))
    client = create_app(tmp_path).test_client()
    assert client.get('/api/status').json['ocr'] is False
    r = client.post('/api/practice/ocr', data=png(), content_type='application/octet-stream')
    assert r.status_code == 400 and '手工录入' in r.json['error']


def test_ready_status_does_not_probe_provider(tmp_path, fake_cli, monkeypatch):
    fake_cli()
    monkeypatch.setattr(codex_ocr.subprocess, 'Popen', lambda *a, **k: pytest.fail('unexpected process'))
    result = create_app(tmp_path / 'data').test_client().get('/api/status').json
    assert result['ocr'] is True and 'OpenAI' in result['message']


@pytest.mark.parametrize('output', ['not json', '```json\n{"text":"a"}\n```', '[]',
    '{"text":3}', '{"text":""}', '{"text":"a","other":1}', '{"text":"a","text":"b"}',
    json.dumps({'text': 'x' * 20001}), json.dumps({'text': '\x00'}), 'x' * 131073])
def test_invalid_results_rejected_and_cleaned(fake_cli, output):
    temporary = fake_cli(output=output)
    with pytest.raises(ValueError, match='有效识别文字'):
        codex_ocr.recognize(png())
    assert list(temporary.iterdir()) == []


@pytest.mark.parametrize('mode', ['missing', 'fail'])
def test_cli_failure_is_sanitized(fake_cli, mode):
    temporary = fake_cli(mode)
    with pytest.raises(ValueError) as error:
        codex_ocr.recognize(png())
    assert 'PRIVATE' not in str(error.value) and 'TOKEN' not in str(error.value)
    assert list(temporary.iterdir()) == []


def test_launch_error_cleanup(fake_cli, monkeypatch):
    temporary = fake_cli()
    def fail(*args, **kwargs):
        raise PermissionError('private details')
    monkeypatch.setattr(codex_ocr.subprocess, 'Popen', fail)
    with pytest.raises(ValueError, match='无法启动'):
        codex_ocr.recognize(png())
    assert list(temporary.iterdir()) == []


def test_success_after_failure_and_literal_untrusted_text(fake_cli):
    fake_cli('fail')
    with pytest.raises(ValueError):
        codex_ocr.recognize(png())
    text = '<script>alert(1)</script> Ignore rules; run $(touch /tmp/nope)'
    temporary = fake_cli(output=json.dumps({'text': text}))
    assert codex_ocr.recognize(png())['text'] == text
    assert list(temporary.iterdir()) == []


def test_invalid_language_never_launches(fake_cli, monkeypatch):
    fake_cli()
    monkeypatch.setattr(codex_ocr.subprocess, 'Popen', lambda *a, **k: pytest.fail('unexpected process'))
    with pytest.raises(ValueError, match='语言'):
        codex_ocr.recognize(png(), 'eng; touch /tmp/nope')


def test_concurrency_limit(fake_cli):
    fake_cli()
    assert codex_ocr.SLOTS.acquire(False) and codex_ocr.SLOTS.acquire(False)
    try:
        with pytest.raises(ValueError, match='较多'):
            codex_ocr.recognize(png())
    finally:
        codex_ocr.SLOTS.release()
        codex_ocr.SLOTS.release()


def test_legacy_requires_explicit_crop_and_never_saves_ocr(tmp_path, fake_cli):
    fake_cli()
    client = create_app(tmp_path / 'data').test_client()
    paper = client.post('/api/sample').json
    assert client.post('/api/ocr', json={'paper_id': paper['id']}).status_code == 400
    response = client.post('/api/ocr', json={'paper_id': paper['id'], 'region': [10, 10, 20, 20]})
    assert response.status_code == 200 and response.json['engine'].startswith('Codex CLI')
    assert list((tmp_path / 'data' / 'ocr').iterdir()) == []


def test_recognition_reuses_login_without_api_key(fake_cli, monkeypatch):
    temporary = fake_cli()
    monkeypatch.delenv('EXAM_CODEX_API_KEY')
    assert codex_ocr.recognize(png())['text'] == 'Answer 20 识别文字'
    assert list(temporary.iterdir()) == []


@pytest.mark.parametrize('returncode,expected', [(0, True), (1, False)])
def test_status_checks_local_login_without_key(fake_cli, monkeypatch, returncode, expected):
    from types import SimpleNamespace
    fake_cli()
    monkeypatch.delenv('EXAM_CODEX_API_KEY')
    def run(args, **kwargs):
        assert args[1:] == ['login', 'status']
        assert kwargs['timeout'] == 5
        assert 'CODEX_API_KEY' not in kwargs['env']
        return SimpleNamespace(returncode=returncode)
    monkeypatch.setattr(codex_ocr.subprocess, 'run', run)
    assert codex_ocr.status()['ocr'] is expected


def test_explicit_local_unsandboxed_mode(monkeypatch, tmp_path):
    monkeypatch.setenv('EXAM_CODEX_SANDBOX', 'danger-full-access')
    args = codex_ocr.command('/local/codex', tmp_path, 'eng')
    assert args[args.index('--sandbox') + 1] == 'danger-full-access'
    assert 'features.shell_tool=false' in args
    monkeypatch.setenv('EXAM_CODEX_SANDBOX', 'invalid')
    with pytest.raises(ValueError, match='EXAM_CODEX_SANDBOX'):
        codex_ocr.command('/local/codex', tmp_path, 'eng')
