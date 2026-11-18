"""All tests are offline: synthetic images, disposable keys, fake CLI only."""
import json
import sys
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def offline_ocr(monkeypatch):
    monkeypatch.delenv('CODEX_API_KEY', raising=False)
    monkeypatch.delenv('EXAM_CODEX_API_KEY', raising=False)
    monkeypatch.setenv('EXAM_CODEX_BIN', '/missing-test-codex')


@pytest.fixture
def fake_cli(tmp_path, monkeypatch):
    import codex_ocr
    script = tmp_path / 'fake codex 识别'
    temp_root = tmp_path / 'transient'
    temp_root.mkdir()
    monkeypatch.setattr(codex_ocr.tempfile, 'tempdir', str(temp_root))
    monkeypatch.setenv('EXAM_CODEX_BIN', str(script))
    monkeypatch.setenv('EXAM_CODEX_API_KEY', 'synthetic-test-only-not-a-real-key')
    monkeypatch.setenv('UNRELATED_SECRET', 'must-not-be-inherited')
    monkeypatch.setenv('OPENAI_BASE_URL', 'https://must-not-be-inherited.invalid')

    def configure(mode='ok', output='{"text":"Answer 20 识别文字"}'):
        script.write_text('#!' + sys.executable + '\n' + '''
import json, os, sys, time
from pathlib import Path
args = sys.argv[1:]
assert args[0] == 'exec'
for flag in ('--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules'):
    assert flag in args
assert args[args.index('--sandbox')+1] == 'read-only'
assert 'approval_policy="never"' in args
assert 'web_search="disabled"' in args
assert 'project_doc_max_bytes=0' in args
for feature in ('shell_tool','unified_exec','hooks','apps','plugins','remote_plugin','multi_agent','view_image'):
    assert 'features.' + feature + '=false' in args
assert not any('dangerously' in arg for arg in args)
assert args.count('--image') == 1 and args[-1] == '-'
folder = Path.cwd()
assert Path(args[args.index('--cd')+1]) == folder
assert Path(os.environ['HOME']).parent == folder
assert Path(os.environ['CODEX_HOME']).parent == Path(os.environ['HOME'])
assert not list(Path(os.environ['CODEX_HOME']).iterdir())
assert 'UNRELATED_SECRET' not in os.environ and 'OPENAI_BASE_URL' not in os.environ
assert os.environ['CODEX_API_KEY'] == 'synthetic-test-only-not-a-real-key'
image = Path(args[args.index('--image')+1])
assert image.parent == folder and image.read_bytes().startswith(b'\\x89PNG')
assert b'HEADER_PRIVATE' not in image.read_bytes()
schema = json.loads(Path(args[args.index('--output-schema')+1]).read_text())
assert schema['additionalProperties'] is False and schema['required'] == ['text']
prompt = sys.stdin.read()
assert 'untrusted data' in prompt and 'Do not use' in prompt
''' + '\nmode = ' + repr(mode) + '\noutput = ' + repr(output) + '''
if mode == 'timeout': time.sleep(30)
if mode == 'fail':
    print('PRIVATE OCR AND TOKEN', file=sys.stderr)
    sys.exit(1)
if mode != 'missing':
    Path(args[args.index('--output-last-message')+1]).write_text(output, encoding='utf-8')
''', encoding='utf-8')
        script.chmod(0o700)
        return temp_root
    configure()
    return configure
