import base64
import io
import sqlite3

import pytest
from PIL import Image, PngImagePlugin

from app import create_app
from image_utils import clean_image, MAX_IMAGE_BYTES


def marked_png():
    out = io.BytesIO()
    meta = PngImagePlugin.PngInfo()
    meta.add_text('comment', 'HEADER_PRIVATE')
    exif = Image.Exif()
    exif[270] = 'HEADER_PRIVATE'
    Image.new('RGB', (80, 60), 'white').save(out, 'PNG', pnginfo=meta, exif=exif)
    return out.getvalue()


def test_saved_bank_asset_strips_metadata_and_rolls_back_invalid_question(tmp_path):
    client = create_app(tmp_path).test_client()
    question = dict(schemaVersion=2, sourceNumber='', tags=[], warnings=[], subject='数学', kind='解答题', blocks=[dict(
        id='image_1', type='image', version=1, assetId='asset_1', alt='几何图')])
    payload = dict(question=question, reviewed=True, assets={'asset_1': {
        'mimeType':'image/png', 'content':base64.b64encode(marked_png()).decode()}})
    assert client.post('/api/bank/questions', json=payload).status_code == 201
    block = client.get('/api/bank/questions').json[0]['blocks'][0]
    raw = client.get('/api/bank/assets/' + block['assetId']).data
    assert b'HEADER_PRIVATE' not in raw
    assert Image.open(io.BytesIO(raw)).size == (80, 60)
    question['blocks'].append(dict(type='unknown'))
    assert client.post('/api/bank/questions', json=payload).status_code == 400
    with sqlite3.connect(tmp_path / 'notebook.sqlite3') as conn:
        assert conn.execute('SELECT count(*) FROM bank_asset').fetchone()[0] == 1
        assert conn.execute('SELECT count(*) FROM bank_question').fetchone()[0] == 1


@pytest.mark.parametrize('raw', [b'', b'invalid image', b'x' * (MAX_IMAGE_BYTES + 1)])
def test_invalid_images_rejected(raw):
    with pytest.raises(ValueError):
        clean_image(raw)
