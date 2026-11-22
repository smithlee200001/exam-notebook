import base64
import copy
import io
import json
import sqlite3

import pytest
from PIL import Image
from app import create_app
from content import validate, walk
from scripts.generate_examples import examples as answered_examples

def examples():
    qs=answered_examples()
    for q in qs:q.pop('answer',None)
    return qs
import bank


def question(): return examples()[0]

def save(c,q):
    q=copy.deepcopy(q)
    assets=q.pop('assets',{})
    return c.post('/api/bank/questions',json={'question':q,'assets':assets,'reviewed':True,'source':'测试卷'})


def png():
    out=io.BytesIO();Image.new('RGB',(100,200),'white').save(out,format='PNG');return out.getvalue()


def test_all_examples_save_reload_compose_and_assets(tmp_path):
    c=create_app(tmp_path).test_client()
    ids=[]
    for q in examples():
        response=save(c,q)
        assert response.status_code==201,response.json
        ids.append(response.json['id'])
    rows=c.get('/api/bank/questions').json
    assert len(rows)==16
    for q in rows:
        assert q['schemaVersion']==2
        for b in walk(q['blocks']):
            assert 'data' not in b
            if b['type']=='image':
                asset=c.get('/api/bank/assets/'+b['assetId'])
                assert asset.status_code==200
                assert asset.mimetype in ('image/png','image/svg+xml')
                assert 'sandbox' in asset.headers['Content-Security-Policy']
    wid=c.post('/api/bank/worksheets',json={'title':'类型验证','items':[{'id':i,'lines':2} for i in ids]}).json['id']
    sheet=create_app(tmp_path).test_client().get('/api/bank/worksheets/'+wid).json
    assert [i['question']['id'] for i in sheet['items']]==ids
    assert [i['question'] for i in sheet['items']]==list(reversed(rows))
    with sqlite3.connect(tmp_path/'notebook.sqlite3') as db:
        stored=json.loads(db.execute('select content from bank_question limit 1').fetchone()[0])
        assert 'subject' not in stored and 'kind' not in stored
        assert db.execute('select count(*) from bank_asset').fetchone()[0]>0


def test_nested_widths_and_snapshot_are_preserved(tmp_path):
    c=create_app(tmp_path).test_client();q=examples()[13]
    for b in walk(q['blocks']):
        if b['type'] in ('image','geometry'):b['display']={'align':'left','widthPercent':35}
    qid=save(c,q).json['id']
    wid=c.post('/api/bank/worksheets',json={'items':[{'id':qid,'lines':0}]}).json['id']
    sheet=c.get('/api/bank/worksheets/'+wid).json
    for b in walk(sheet['items'][0]['question']['blocks']):
        if b['type'] in ('geometry','image'):assert b['display']=={'align':'left','widthPercent':35}
    with sqlite3.connect(tmp_path/'notebook.sqlite3') as db:db.execute('update bank_question set content=? where id=?',(json.dumps(validate(question())),qid))
    assert c.get('/api/bank/worksheets/'+wid).json==sheet


def test_existing_asset_can_be_reused_without_mutating_original(tmp_path):
    c=create_app(tmp_path).test_client();save(c,examples()[12]);stored=c.get('/api/bank/questions').json[0]
    original=[b['assetId'] for b in walk(stored['blocks']) if b['type']=='image']
    payload={k:stored[k] for k in ('schemaVersion','sourceNumber','subject','kind','tags','warnings','blocks')}
    assert save(c,payload).status_code==201
    latest=c.get('/api/bank/questions').json[0]
    copied=[b['assetId'] for b in walk(latest['blocks']) if b['type']=='image']
    assert set(original).isdisjoint(copied)
    for a,b in zip(original,copied):assert c.get('/api/bank/assets/'+a).data==c.get('/api/bank/assets/'+b).data


def test_failed_assets_are_atomic(tmp_path):
    c=create_app(tmp_path).test_client();q=examples()[12];del q['assets']['asset_png']
    assert save(c,q).status_code==400
    assert c.get('/api/bank/questions').json==[]
    with sqlite3.connect(tmp_path/'notebook.sqlite3') as db:assert db.execute('select count(*) from bank_asset').fetchone()[0]==0
    assert save(c,question()).json['number']=='Q000001'


@pytest.mark.parametrize('mutate',[
    lambda q:q.update(schemaVersion=1),
    lambda q:q.update(choices=['A']),
    lambda q:q['blocks'][0].update(data={'text':'old'}),
    lambda q:q['blocks'][0].update(type='latex'),
    lambda q:q['blocks'][1].update(id=q['blocks'][0]['id']),
    lambda q:q['blocks'][1].update(display={'widthEm':float('inf')}),
    lambda q:q.update(blocks=[]),
])
def test_invalid_content_rejected(tmp_path,mutate):
    c=create_app(tmp_path).test_client();q=question();mutate(q)
    assert save(c,q).status_code==400
    assert c.get('/api/bank/questions').json==[]


def test_text_children_exclusive_and_row_shape(tmp_path):
    c=create_app(tmp_path).test_client();q=examples()[2];q['blocks'][1]['children'][0]['children']=[]
    assert save(c,q).status_code==400
    q=examples()[7];q['blocks'][1]['children'][1]['children'].pop()
    assert save(c,q).status_code==400


@pytest.mark.parametrize('change',[
    lambda b:b['series'][0].update(values=[1]),
    lambda b:b['series'][0].update(values=[1,2,None,4]),
    lambda b:b['yAxis'].update(min=2),
    lambda b:b.update(chartType='pie'),
])
def test_invalid_chart(change):
    q=examples()[9];change(q['blocks'][1])
    with pytest.raises(ValueError):validate(q)


@pytest.mark.parametrize('svg',[
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"/>',
    '<svg><image href="https://example.com/a.png"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x "bad">]><svg>&x;</svg>',
    '<svg><foreignObject/></svg>',
    '<svg><rect fill="url(https://example.com)"/></svg>',
])
def test_svg_active_content_rejected(tmp_path,svg):
    c=create_app(tmp_path).test_client()
    r=c.post('/api/bank/assets/validate',json={'mimeType':'image/svg+xml','content':base64.b64encode(svg.encode()).decode()})
    assert r.status_code==400


def test_nested_extraction_crop_and_schema(tmp_path,monkeypatch):
    q=examples()[12];q.pop('assets')
    for block in list(walk(q['blocks'])):
        block.pop('display',None)
        for key in bank.OCR_FIELDS:
            block.setdefault(key,None)
    def fake(png_bytes,schema,prompt,reader):
        assert 'untrusted data' in prompt
        output=tmp_path/'result.json';output.write_text(json.dumps({'questions':[q],'crops':[{'assetId':'asset_svg','box':[100,200,500,600]},{'assetId':'asset_png','box':[0,0,1000,1000]}]}))
        return reader(output)
    monkeypatch.setattr(bank.codex_ocr,'run_structured',fake)
    c=create_app(tmp_path/'db').test_client();r=c.post('/api/bank/extract',data=png(),content_type='application/octet-stream')
    assert r.status_code==200,r.json
    draft=r.json['questions'][0]
    im=Image.open(io.BytesIO(base64.b64decode(draft['assets']['asset_svg']['content'])))
    assert im.size==(40,80)
    assert c.get('/api/bank/questions').json==[]
    assert save(c,draft).status_code==201


def test_worksheet_and_review_validation(tmp_path):
    c=create_app(tmp_path).test_client()
    assert c.post('/api/bank/questions',json={'question':question()}).status_code==400
    save(c,question())
    for items in ([],[{'id':99}],[{'id':1},{'id':1}],[{'id':True}],[{'id':1,'lines':-1}]):
        assert c.post('/api/bank/worksheets',json={'items':items}).status_code==400
    assert c.get('/api/bank/worksheets').json==[]
    assert c.get('/api/bank/worksheets/missing').status_code==404


def test_nested_groups_are_not_supported():
    q=examples()[2]
    option=q['blocks'][1]['children'][0]
    del option['text']
    nested=copy.deepcopy(q['blocks'][1])
    nested['children']=[{'id':'nested_a','type':'option','version':1,'text':'A'}, {'id':'nested_b','type':'option','version':1,'text':'B'}]
    nested['id']='nested_options'
    option['children']=[nested]
    with pytest.raises(ValueError, match='嵌套'):validate(q)
