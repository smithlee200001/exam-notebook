import base64
import io
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
from types import SimpleNamespace

from PIL import Image, PngImagePlugin
import pytest
from app import create_app


def png(marker='HEADER_PRIVATE'):
    out = io.BytesIO()
    meta = PngImagePlugin.PngInfo()
    meta.add_text('comment', marker)
    exif = Image.Exif()
    exif[270] = marker
    Image.new('RGB', (80, 60), 'white').save(out, 'PNG', pnginfo=meta, exif=exif)
    return out.getvalue()


def exercise():
    return dict(title='解方程', blocks=[{'type': 'text', 'text': '求 x：'},
                                      {'type': 'latex', 'text': '3x+5=20'}],
                choices=['3', '5', '7'], parts=['写出计算过程'],
                answer='5', explanation='先减 5 再除以 3', reviewed=True)


def contents(path):
    return {p.relative_to(path).as_posix(): p.read_bytes() for p in path.rglob('*') if p.is_file()}


def test_standalone_survives_restart_answers_hidden(tmp_path):
    client = create_app(tmp_path).test_client()
    r = client.post('/api/practice', json=exercise())
    assert r.status_code == 201
    qid = r.json['id']
    restarted = create_app(tmp_path).test_client()
    question = restarted.get('/api/practice/' + qid)
    assert question.json['blocks'] == exercise()['blocks']
    assert question.json['choices'] == ['3', '5', '7']
    assert question.json['parts'] == ['写出计算过程']
    assert 'answer' not in question.json and 'explanation' not in question.json
    assert 'answer' not in restarted.get('/api/practice').json[0]
    assert restarted.get(f'/api/practice/{qid}/answer').json['answer'] == '5'
    assert question.headers['Cache-Control'] == 'no-store'
    with sqlite3.connect(tmp_path / 'notebook.sqlite3') as conn:
        assert conn.execute('SELECT count(*) FROM papers').fetchone()[0] == 0
    assert list((tmp_path / 'images').iterdir()) == []
    assert list((tmp_path / 'originals').iterdir()) == []


def test_ocr_does_not_persist_input_or_raw_text(tmp_path, monkeypatch):
    client = create_app(tmp_path).test_client()
    before = contents(tmp_path)
    monkeypatch.setattr('practice.shutil.which', lambda _: '/tesseract')
    def run(args, **kwargs):
        assert args[1:3] == ['stdin', 'stdout']
        assert b'HEADER_PRIVATE' not in kwargs['input']
        return SimpleNamespace(returncode=0, stdout='识别文字'.encode())
    monkeypatch.setattr('practice.subprocess.run', run)
    r = client.post('/api/practice/ocr?lang=chi_sim%2Beng', data=png(), content_type='application/octet-stream')
    assert r.status_code == 200 and r.json['text'] == '识别文字'
    assert contents(tmp_path) == before


def test_ocr_failure_no_files(tmp_path, monkeypatch):
    client = create_app(tmp_path).test_client()
    before = contents(tmp_path)
    monkeypatch.setattr('practice.shutil.which', lambda _: '/tesseract')
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired('tesseract', 45)
    monkeypatch.setattr('practice.subprocess.run', timeout)
    assert client.post('/api/practice/ocr', data=png(), content_type='application/octet-stream').status_code == 400
    assert contents(tmp_path) == before


def test_approved_assets_strip_metadata_and_no_orphans(tmp_path):
    client = create_app(tmp_path).test_client()
    payload = exercise()
    image = dict(type='image', data='data:image/png;base64,' + base64.b64encode(png()).decode(), alt='几何图', approved=True)
    payload['blocks'].append(image)
    payload['student_answer'] = 'DO_NOT_STORE_OLD_ANSWER'
    qid = client.post('/api/practice', json=payload).json['id']
    reopened = create_app(tmp_path).test_client()
    block = reopened.get(f'/api/practice/{qid}').json['blocks'][-1]
    raw = reopened.get('/api/practice/assets/' + block['asset_id']).data
    assert b'HEADER_PRIVATE' not in raw
    assert Image.open(io.BytesIO(raw)).size == (80, 60)
    assert b'DO_NOT_STORE_OLD_ANSWER' not in (tmp_path / 'notebook.sqlite3').read_bytes()
    payload['blocks'].append(dict(type='unknown'))
    assert client.post('/api/practice', json=payload).status_code == 400
    with sqlite3.connect(tmp_path / 'notebook.sqlite3') as conn:
        assert conn.execute('SELECT count(*) FROM question_asset').fetchone()[0] == 1
        assert conn.execute('SELECT count(*) FROM practice_question').fetchone()[0] == 1


@pytest.mark.parametrize('change', [
    {'reviewed': False}, {'blocks': []}, {'choices': 'not an array'},
    {'blocks': [{'type': 'image', 'data': 'https://evil.example/img.png', 'approved': True}]},
    {'blocks': [{'type': 'image', 'data': 'data:image/png;base64,@@@', 'approved': True}]},
    {'blocks': [{'type': 'image', 'data': 'data:image/png;base64,AAAA', 'approved': False}]},
    {'blocks': [{'type': 'html', 'text': '<script>alert(1)</script>'}]},
    {'blocks': [{'type': 'latex', 'text': ''}]},
])
def test_validation(tmp_path, change):
    client = create_app(tmp_path).test_client()
    payload = exercise() | change
    assert client.post('/api/practice', json=payload).status_code == 400
    assert client.get('/api/practice').json == []


def test_ocr_rejects_multipart_invalid_and_cross_origin(tmp_path):
    client = create_app(tmp_path).test_client()
    assert client.post('/api/practice/ocr', data={'file': (io.BytesIO(png()), 'crop.png')}).status_code == 400
    assert client.post('/api/practice/ocr', data=b'not image', content_type='application/octet-stream').status_code == 400
    assert client.post('/api/practice', json=exercise(), headers={'Origin': 'https://evil.example'}).status_code == 403
    assert client.get('/api/practice/missing').status_code == 404
    assert client.get('/api/practice/assets/missing').status_code == 404


def test_legacy_data_is_untouched(tmp_path):
    client = create_app(tmp_path).test_client()
    p = client.post('/api/sample').json
    client.post('/api/questions', json={'paper_id': p['id'], 'stem': 'old', 'reviewed': True})
    before = {k: v for k, v in contents(tmp_path).items() if k != 'notebook.sqlite3'}
    client.post('/api/practice', json=exercise())
    restarted = create_app(tmp_path).test_client()
    assert restarted.get('/api/questions').json[0]['payload']['stem'] == 'old'
    assert {k: v for k, v in contents(tmp_path).items() if k != 'notebook.sqlite3'} == before


@pytest.mark.skipif(not shutil.which('tesseract'), reason='Local Tesseract not installed')
def test_real_crop_ocr_no_storage(tmp_path):
    client = create_app(tmp_path).test_client()
    before = contents(tmp_path)
    source = Image.open(Path('samples/exam.png'))
    out = io.BytesIO()
    source.crop((80, 1360, 1140, 1540)).save(out, 'PNG')
    r = client.post('/api/practice/ocr?lang=eng', data=out.getvalue(), content_type='application/octet-stream')
    assert r.status_code == 200 and 'Answer' in r.json['text']
    assert contents(tmp_path) == before
