import base64
import io
import json

import pytest
from PIL import Image
from app import create_app
import bank


def question(**changes):
    return dict(source_number='12', subject='数学', kind='计算题', tags=['方程'],
                blocks=[{'type': 'text', 'text': '解方程'}, {'type': 'latex', 'text': '3x+5=20'}],
                choices=[], parts=[], warnings=[], **changes)


def png():
    out = io.BytesIO()
    Image.new('RGB', (100, 200), 'white').save(out, format='PNG')
    return out.getvalue()


def save(client, q):
    return client.post('/api/bank/questions', json={'question': q, 'reviewed': True, 'source': '测试卷'})


def test_bank_numbering_assets_and_ordered_worksheet_survive_restart(tmp_path):
    c = create_app(tmp_path).test_client()
    q = question()
    q['blocks'].append(dict(type='image', text='三角形', box=[0, 0, 500, 500],
                            data='data:image/png;base64,' + base64.b64encode(png()).decode()))
    first, second = save(c, q).json, save(c, question()).json
    assert first['number'] == 'Q000001' and second['number'] == 'Q000002'
    rows = c.get('/api/bank/questions').json
    image = rows[1]['blocks'][2]
    assert 'data' not in image
    assert c.get('/api/bank/assets/' + image['asset_id']).data.startswith(b'\x89PNG')
    result = c.post('/api/bank/worksheets', json={'title': '专项练习', 'items': [
        {'id': second['id'], 'lines': 6}, {'id': first['id'], 'lines': 0}]})
    assert result.status_code == 201
    restarted = create_app(tmp_path).test_client()
    worksheet = restarted.get('/api/bank/worksheets/' + result.json['id']).json
    assert [i['question']['id'] for i in worksheet['items']] == [2, 1]
    assert worksheet['items'][0]['lines'] == 6
    assert worksheet['items'][1]['question']['source_number'] == '12'
    assert len(restarted.get('/api/bank/questions').json) == 2
    assert len(restarted.get('/api/bank/worksheets').json) == 1
    assert restarted.get('/api/bank/worksheets/missing').status_code == 404


def test_invalid_save_does_not_create_partial_question(tmp_path):
    c = create_app(tmp_path).test_client()
    assert c.post('/api/bank/questions', json={'question': question()}).status_code == 400
    q = question()
    q['blocks'].append({'type': 'image', 'text': '图', 'box': [0, 0, 200, 300], 'data': 'https://example.com/x'})
    assert save(c, q).status_code == 400
    assert c.get('/api/bank/questions').json == []
    assert save(c, question()).json['number'] == 'Q000001'
    for items in ([], [{'id': 99}], [{'id': 1}, {'id': 1}], [{'id': 1, 'lines': -1}], [{'id': True}]):
        assert c.post('/api/bank/worksheets', json={'items': items}).status_code == 400
    assert c.get('/api/bank/worksheets').json == []


def test_extraction_crops_diagram_and_does_not_store_drafts(tmp_path, monkeypatch):
    q = question()
    q['blocks'].append({'type': 'image', 'text': '三角形', 'box': [100, 200, 500, 600]})
    def fake(png_bytes, schema, prompt, reader):
        assert schema['required'] == ['questions']
        assert 'untrusted data' in prompt
        output = tmp_path / 'result.json'
        output.write_text(json.dumps({'questions': [q]}))
        return reader(output)
    monkeypatch.setattr(bank.codex_ocr, 'run_structured', fake)
    c = create_app(tmp_path / 'db').test_client()
    response = c.post('/api/bank/extract', data=png(), content_type='application/octet-stream')
    assert response.status_code == 200
    figure = response.json['questions'][0]['blocks'][2]
    image = Image.open(io.BytesIO(base64.b64decode(figure['data'].split(',')[1])))
    assert image.size == (40, 80)
    assert c.get('/api/bank/questions').json == []
    assert c.post('/api/bank/extract', json={}).status_code == 400


@pytest.mark.parametrize('box', [[-1, 0, 100, 100], [0, 0, 1001, 100], [20, 20, 10, 10], [0, 0, float('nan'), 100], []])
def test_invalid_model_coordinates_rejected(tmp_path, box):
    q = question()
    q['blocks'] = [{'type': 'image', 'text': '图表', 'box': box}]
    path = tmp_path / 'result.json'
    path.write_text(json.dumps({'questions': [q]}))
    with pytest.raises(ValueError, match='拆题数据无效'):
        bank.read_extraction(path)


def test_structured_cli_end_to_end_and_temporary_cleanup(tmp_path, fake_cli):
    import os
    from pathlib import Path
    temporary = fake_cli(output=json.dumps({'questions': [question()]}))
    script = Path(os.environ['EXAM_CODEX_BIN'])
    script.write_text(script.read_text().replace("schema['required'] == ['text']", "schema['required'] == ['questions']"))
    c = create_app(tmp_path / 'data').test_client()
    response = c.post('/api/bank/extract', data=png(), content_type='application/octet-stream')
    assert response.status_code == 200
    assert response.json['questions'][0]['source_number'] == '12'
    assert list(temporary.iterdir()) == []
    assert c.get('/api/bank/questions').json == []
