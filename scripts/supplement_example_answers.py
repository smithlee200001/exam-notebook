"""Add missing answers only to unchanged bundled examples; never replace user answers."""
import copy
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:sys.path.insert(0,str(ROOT))
from app import create_app
from scripts.generate_examples import examples
from content import validate,walk


def supplement(app):
    client=app.test_client();count=0
    for stored in client.get('/api/bank/questions').json:
        if client.get(f"/api/bank/questions/{stored['id']}/answer").json['answer'] is not None:continue
        current={k:stored[k] for k in ('schemaVersion','sourceNumber','subject','kind','tags','warnings','blocks')}
        for example in examples():
            q=copy.deepcopy(example);a=q.pop('answer');q.pop('assets',None)
            actual={b['id']:b for b in walk(current['blocks'])};mapping={}
            for b in walk(q['blocks']):
                if b['type']=='image' and b['id'] in actual and actual[b['id']]['type']=='image':
                    mapping[b['assetId']]=actual[b['id']]['assetId'];b['assetId']=actual[b['id']]['assetId']
            if validate(q)!=validate(current):continue
            for e in a['entries']:
                for b in walk(e.get('blocks',[])+e.get('explanation',[])):
                    if b['type']=='image':b['assetId']=mapping.get(b['assetId'],b['assetId'])
            r=client.put(f"/api/bank/questions/{stored['id']}/answer",json={'answer':a})
            if r.status_code!=200:raise RuntimeError(r.json)
            count+=1;break
    return count


if __name__=='__main__':print(f'Added answers to {supplement(create_app())} unchanged examples; existing answers and worksheets preserved.')
