import sqlite3

import pytest

from app import create_app


def test_startup_creates_only_current_tables(tmp_path):
    client = create_app(tmp_path).test_client()
    assert client.get('/').status_code == 200
    assert b'/single' not in client.get('/').data
    assert {p.name for p in tmp_path.iterdir()} == {'notebook.sqlite3'}
    with sqlite3.connect(tmp_path / 'notebook.sqlite3') as conn:
        tables = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    assert tables == {'bank_question', 'bank_asset', 'bank_answer', 'worksheet'}


@pytest.mark.parametrize('method,path', [
    ('get', '/single'), ('get', '/api/papers'), ('post', '/api/upload'),
    ('post', '/api/sample'), ('post', '/api/ocr'), ('get', '/api/questions'),
    ('post', '/api/questions'), ('get', '/api/export'), ('get', '/images/test.jpg'),
    ('get', '/api/practice'), ('post', '/api/practice'), ('post', '/api/practice/ocr'),
    ('get', '/api/practice/sample'), ('get', '/api/practice/example/answer'),
    ('get', '/static/index.html'), ('get', '/static/app.js'), ('get', '/static/practice.js'),
])
def test_removed_routes_are_unavailable(tmp_path, method, path):
    client = create_app(tmp_path).test_client()
    assert getattr(client, method)(path).status_code == 404


def test_local_access_and_upload_validation(tmp_path):
    client = create_app(tmp_path).test_client()
    assert client.get('/', headers={'Host': 'evil.example'}).status_code == 403
    assert client.post('/api/bank/questions', json={}, headers={'Origin': 'https://evil.example'}).status_code == 403
    assert client.post('/api/bank/extract', data=b'invalid', content_type='application/octet-stream').status_code == 400
    assert client.post('/api/bank/extract', data={}, content_type='multipart/form-data').status_code == 400
    assert client.get('/api/bank/assets/missing').status_code == 404
