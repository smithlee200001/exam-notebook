"""Exercise the bundled demo data through the real save and worksheet APIs."""
import json
from pathlib import Path

import sqlite3
import pytest
from geometry import validate_geometry
from app import create_app

ROOT = Path(__file__).resolve().parents[1]


def test_geometry_examples_save_as_json_and_survive_worksheet_restart(tmp_path):
    # The generated function returns one JSON literal, with no computed values.
    source = (ROOT / 'static/demo.js').read_text()
    drafts = json.loads(source.split('return ', 1)[1].rsplit(';', 1)[0])
    client = create_app(tmp_path).test_client()
    ids = []
    for draft in drafts:
        response = client.post('/api/bank/questions', json={
            'question': draft, 'source': '几何排版示例', 'reviewed': True})
        assert response.status_code == 201
        ids.append(response.json['id'])
    result = client.post('/api/bank/worksheets', json={
        'title': '几何三题练习', 'items': [{'id': qid, 'lines': 6} for qid in ids]})
    assert result.status_code == 201
    restarted = create_app(tmp_path).test_client()
    sheet = restarted.get('/api/bank/worksheets/' + result.json['id']).json
    assert [item['question']['id'] for item in sheet['items']] == ids
    for item, draft in zip(sheet['items'], drafts):
        q = item['question']
        assert q['parts'] == draft['parts']
        assert [b for b in q['blocks'] if b['type'] == 'latex'] == [b for b in draft['blocks'] if b['type'] == 'latex']
        block = next(b for b in q['blocks'] if b['type'] == 'geometry')
        assert block == next(b for b in draft['blocks'] if b['type'] == 'geometry')
        assert 'asset_id' not in block and 'data' not in block
    with sqlite3.connect(tmp_path / 'notebook.sqlite3') as db:
        assert db.execute('SELECT count(*) FROM bank_asset').fetchone()[0] == 0


@pytest.mark.parametrize('change', [
    lambda g: g.update(version=2),
    lambda g: g.update(onload='alert(1)'),
    lambda g: g['points']['A'].update(x=float('nan')),
    lambda g: g['segments'][0].update(to='missing'),
    lambda g: g['segments'][1].update(id=g['segments'][0]['id']),
    lambda g: g['segments'][0].update(to='A'),
    lambda g: g['rightAngles'][0].update(arms=['B','B']),
    lambda g: g['givens'][0].update(segment='missing'),
    lambda g: g['givens'][0].update(value=-1),
])
def test_invalid_geometry_never_creates_a_question(tmp_path, change):
    source = (ROOT / 'static/demo.js').read_text()
    q = json.loads(source.split('return ', 1)[1].rsplit(';', 1)[0])[0]
    geometry = next(b for b in q['blocks'] if b['type'] == 'geometry')
    change(geometry)
    with pytest.raises(ValueError):
        validate_geometry(geometry)
    client = create_app(tmp_path).test_client()
    assert client.post('/api/bank/questions', json={'question':q,'reviewed':True}).status_code == 400
    assert client.get('/api/bank/questions').json == []


def test_geometry_percent_defaults_and_persists_in_bank_and_snapshot(tmp_path):
    source = (ROOT / 'static/demo.js').read_text()
    drafts = json.loads(source.split('return ', 1)[1].rsplit(';', 1)[0])
    widths = [60, 35, 100]
    for i, q in enumerate(drafts):
        g = next(b for b in q['blocks'] if b['type'] == 'geometry')
        if i == 0:
            del g['display']
        else:
            g['display']['widthPercent'] = widths[i]
    client = create_app(tmp_path).test_client()
    ids = [client.post('/api/bank/questions', json={'question':q,'reviewed':True}).json['id'] for q in drafts]
    saved = client.post('/api/bank/worksheets', json={'items':[{'id':qid,'lines':4} for qid in ids]})
    assert saved.status_code == 201
    restarted = create_app(tmp_path).test_client()
    bank = {q['id']: q for q in restarted.get('/api/bank/questions').json}
    sheet = restarted.get('/api/bank/worksheets/' + saved.json['id']).json
    for qid, item, width in zip(ids, sheet['items'], widths):
        for q in [bank[qid], item['question']]:
            assert next(b for b in q['blocks'] if b['type']=='geometry')['display']['widthPercent'] == width
    with sqlite3.connect(tmp_path / 'notebook.sqlite3') as db:
        contents = [json.loads(row[0]) for row in db.execute('SELECT content FROM bank_question ORDER BY id')]
        assert [next(b for b in q['blocks'] if b['type']=='geometry')['display']['widthPercent'] for q in contents] == widths


@pytest.mark.parametrize('width', [19, 101, 50.5, True, '60', None, float('nan')])
def test_invalid_geometry_width_rejected(width):
    source = (ROOT / 'static/demo.js').read_text()
    q = json.loads(source.split('return ', 1)[1].rsplit(';', 1)[0])[0]
    g = next(b for b in q['blocks'] if b['type']=='geometry')
    g['display']['widthPercent'] = width
    with pytest.raises(ValueError):
        validate_geometry(g)
