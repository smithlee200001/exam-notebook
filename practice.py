"""Standalone exercises. OCR buffers are transient; only approved assets are stored."""
import base64
import binascii
import io
import json
import shutil
import sqlite3
import subprocess
import uuid
import warnings

from flask import Blueprint, Response, jsonify, request
from PIL import Image, ImageOps

MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_PIXELS = 8_000_000


def clean_image(raw):
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError('选区图片必须小于 4 MB')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in ('PNG', 'JPEG', 'WEBP'):
                    raise ValueError('选区只支持 PNG/JPEG/WebP')
                if source.width * source.height > MAX_PIXELS:
                    raise ValueError('选区不能超过 800 万像素')
                if source.width < 5 or source.height < 5:
                    raise ValueError('选区太小')
                # Re-encode pixels, never retain EXIF, text metadata or source bytes.
                image = ImageOps.exif_transpose(source).convert('RGB')
                image.info.clear()
                out = io.BytesIO()
                image.save(out, format='PNG')
                return out.getvalue()
    except (OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError('选区图片无效或过大') from None


def make_practice(dbpath, sample_path):
    bp = Blueprint('practice', __name__)

    def connect():
        conn = sqlite3.connect(dbpath)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        return conn

    with connect() as conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS practice_question (
                id TEXT PRIMARY KEY, title TEXT NOT NULL,
                blocks TEXT NOT NULL, choices TEXT NOT NULL, parts TEXT NOT NULL,
                answer TEXT NOT NULL, explanation TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS question_asset (
                id TEXT PRIMARY KEY,
                question_id TEXT NOT NULL REFERENCES practice_question(id),
                content BLOB NOT NULL, alt TEXT NOT NULL
            );
        ''')

    def string(value, limit=20000):
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('字段类型错误或内容过长')
        return value.strip()

    def strings(value, limit):
        if not isinstance(value, list) or len(value) > limit:
            raise ValueError('选项或小问过多')
        return [string(item, 4000) for item in value]

    def public(row):
        return dict(id=row['id'], title=row['title'],
                    blocks=json.loads(row['blocks']), choices=json.loads(row['choices']),
                    parts=json.loads(row['parts']), created_at=row['created_at'])

    def load(qid):
        with connect() as conn:
            row = conn.execute('SELECT * FROM practice_question WHERE id=?', (qid,)).fetchone()
        if row is None:
            return None
        return row

    @bp.after_request
    def no_cache(response):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @bp.get('/api/practice/sample')
    def sample():
        return Response(sample_path.read_bytes(), mimetype='image/png')

    @bp.post('/api/practice/ocr')
    def ocr():
        # Raw body avoids multipart temporary-file spooling. Never request.files.
        if request.mimetype != 'application/octet-stream':
            raise ValueError('请只发送选区图片二进制，不支持整页或 multipart 上传')
        if request.content_length and request.content_length > MAX_IMAGE_BYTES:
            raise ValueError('选区图片必须小于 4 MB')
        raw = request.stream.read(MAX_IMAGE_BYTES + 1)
        png = clean_image(raw)
        lang = request.args.get('lang', 'eng')
        if lang not in ('eng', 'chi_sim+eng'):
            raise ValueError('不支持的 OCR 语言')
        executable = shutil.which('tesseract')
        if not executable:
            raise ValueError('未安装本地 Tesseract，可手工录入')
        try:
            result = subprocess.run([executable, 'stdin', 'stdout', '-l', lang, '--psm', '6'],
                                    input=png, capture_output=True, timeout=45)
        except subprocess.TimeoutExpired:
            raise ValueError('OCR 超时，请缩小选区后重试') from None
        if result.returncode:
            raise ValueError('OCR 失败，请检查所选语言包；中文需要 chi_sim')
        return jsonify(text=result.stdout.decode('utf-8').strip(),
                       engine='Tesseract · 仅识别选区，不保存图片或识别原文', confidence=None)

    @bp.post('/api/practice')
    def save():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or payload.get('reviewed') is not True:
            raise ValueError('请先预览并确认题面完整、无旧答案和个人信息')
        title = string(payload.get('title', ''), 200) or '练习题'
        answer = string(payload.get('answer', ''))
        explanation = string(payload.get('explanation', ''))
        choices = strings(payload.get('choices', []), 30)
        parts = strings(payload.get('parts', []), 50)
        blocks = payload.get('blocks')
        if not isinstance(blocks, list) or not 1 <= len(blocks) <= 100:
            raise ValueError('至少填写一个题面内容块，最多 100 个')
        saved, assets = [], []
        for block in blocks:
            if not isinstance(block, dict):
                raise ValueError('题面内容块格式错误')
            kind = block.get('type')
            if kind in ('text', 'latex'):
                text = string(block.get('text', ''))
                if not text:
                    raise ValueError('文字或公式块不能为空')
                saved.append(dict(type=kind, text=text))
            elif kind == 'image':
                if block.get('approved') is not True:
                    raise ValueError('请单独确认图表不含旧答案、批注和个人信息')
                if len(assets) >= 10:
                    raise ValueError('每题最多 10 张图表')
                encoded = block.get('data')
                prefix = 'data:image/png;base64,'
                if not isinstance(encoded, str) or not encoded.startswith(prefix):
                    raise ValueError('图表必须是本地 PNG 裁剪，不能是网址或 SVG')
                try:
                    raw = base64.b64decode(encoded[len(prefix):], validate=True)
                except (ValueError, binascii.Error):
                    raise ValueError('图表编码无效') from None
                png = clean_image(raw)
                aid = uuid.uuid4().hex
                alt = string(block.get('alt', ''), 500)
                saved.append(dict(type='image', asset_id=aid, alt=alt))
                assets.append((aid, png, alt))
            else:
                raise ValueError('仅支持文字、LaTeX 和人工确认的图表')
        qid = uuid.uuid4().hex
        # One transaction: invalid requests cannot leave orphan image files/assets.
        with connect() as conn:
            conn.execute('INSERT INTO practice_question(id,title,blocks,choices,parts,answer,explanation) VALUES(?,?,?,?,?,?,?)',
                         (qid, title, json.dumps(saved, ensure_ascii=False), json.dumps(choices, ensure_ascii=False),
                          json.dumps(parts, ensure_ascii=False), answer, explanation))
            conn.executemany('INSERT INTO question_asset(id,question_id,content,alt) VALUES(?,?,?,?)',
                             [(aid, qid, png, alt) for aid, png, alt in assets])
        return jsonify(id=qid), 201

    @bp.get('/api/practice')
    def listing():
        with connect() as conn:
            rows = conn.execute('SELECT id,title,blocks,choices,parts,created_at FROM practice_question ORDER BY rowid DESC').fetchall()
        return jsonify([public(row) for row in rows])

    @bp.get('/api/practice/<qid>')
    def detail(qid):
        row = load(qid)
        if row is None:
            return jsonify(error='练习题不存在'), 404
        return jsonify(public(row))

    @bp.get('/api/practice/<qid>/answer')
    def answer(qid):
        row = load(qid)
        if row is None:
            return jsonify(error='练习题不存在'), 404
        return jsonify(answer=row['answer'], explanation=row['explanation'])

    @bp.get('/api/practice/assets/<aid>')
    def asset(aid):
        with connect() as conn:
            row = conn.execute('SELECT content FROM question_asset WHERE id=?', (aid,)).fetchone()
        if row is None:
            return jsonify(error='图表不存在'), 404
        return Response(row['content'], mimetype='image/png')

    return bp
