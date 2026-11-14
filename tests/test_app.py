import io
import json
import shutil
from pathlib import Path
import pytest
from app import create_app

@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path)
    app.config['TESTING'] = True
    return app.test_client()

def test_workflow_and_persistence(client):
    r=client.post('/api/sample'); assert r.status_code==201
    p=r.json
    assert client.get('/images/'+p['image']).status_code==200
    result=client.post('/api/ocr',json={'paper_id':p['id'],'mode':'sample'}).json
    assert '不是 OCR' in result['engine']
    payload={'paper_id':p['id'],'stem':'3x + 5 = 20','region':[10,10,200,100], 'reviewed':True,'grading':'扣 2 分','student_answer':'x=4','correct_answer':'x=5'}
    assert client.post('/api/questions',json=payload).status_code==201
    q=client.get('/api/questions').json
    assert len(q)==1 and q[0]['payload']['grading']=='扣 2 分'
    assert client.get('/api/export').json==q
    assert client.get('/api/papers').json[0]['id']==p['id']

def test_validation(client):
    p=client.post('/api/sample').json
    for payload in ({'stem':'a'},{'stem':'a','reviewed':False},{'stem':'a','reviewed':True,'region':[-1,0,10,10]}):
        assert client.post('/api/questions',json={'paper_id':p['id'],**payload}).status_code==400
    assert client.post('/api/upload',data={'file':(io.BytesIO(b'not image'),'a.png')}).status_code==400
    assert client.post('/api/sample',headers={'Origin':'https://evil.example'}).status_code==403
    assert client.get('/',headers={'Host':'evil.example'}).status_code==403
    assert client.get('/images/../../app.py').status_code==404

def test_uploaded_image_not_mock(client):
    raw=Path('samples/exam.png').read_bytes()
    p=client.post('/api/upload',data={'file':(io.BytesIO(raw),'../image.png')}).json
    assert client.post('/api/ocr',json={'paper_id':p['id'],'mode':'sample'}).status_code==400

@pytest.mark.skipif(not shutil.which('tesseract'),reason='Local Tesseract not installed')
def test_real_ocr(client):
    p=client.post('/api/sample').json
    r=client.post('/api/ocr',json={'paper_id':p['id'],'mode':'real','lang':'eng','region':[80,1360,1060,180]})
    assert r.status_code==200
    assert '20' in r.json['text'] and 'Answer' in r.json['text']

def test_restart(tmp_path):
    c=create_app(tmp_path).test_client();p=c.post('/api/sample').json
    c.post('/api/questions',json={'paper_id':p['id'],'stem':'persist','reviewed':True})
    assert create_app(tmp_path).test_client().get('/api/questions').json[0]['payload']['stem']=='persist'
    assert len(list((tmp_path/'originals').glob('*.bin')))==1
    assert len(json.loads(next((tmp_path/'originals').glob('*.json')).read_text())['sha256'])==64
