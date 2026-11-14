"""Local-only exam review demo. No cloud calls, telemetry or external assets."""
import hashlib
import io
import json
import math
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import uuid
import warnings

from flask import Flask, jsonify, request, send_from_directory
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent

def create_app(data_dir=None):
    app = Flask(__name__, static_folder='static')
    app.config['MAX_CONTENT_LENGTH'] = 12 * 1024 * 1024
    data = Path(data_dir or os.environ.get('EXAM_DATA_DIR', ROOT / 'data'))
    data.mkdir(parents=True, exist_ok=True)
    (data / 'images').mkdir(exist_ok=True)
    (data / 'originals').mkdir(exist_ok=True)
    (data / 'ocr').mkdir(exist_ok=True)
    dbpath = data / 'notebook.sqlite3'
    with sqlite3.connect(dbpath) as db:
        db.executescript('''
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS papers(id TEXT PRIMARY KEY,title TEXT NOT NULL,image TEXT NOT NULL,width INTEGER,height INTEGER,source TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,paper_id TEXT NOT NULL REFERENCES papers(id),payload TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE INDEX IF NOT EXISTS questions_paper ON questions(paper_id);
        ''')
    def db():
        conn = sqlite3.connect(dbpath)
        conn.execute('PRAGMA foreign_keys=ON')
        conn.row_factory = sqlite3.Row
        return conn
    def paper(pid):
        with db() as conn:
            row = conn.execute('SELECT * FROM papers WHERE id=?', (pid,)).fetchone()
        if row is None:
            raise ValueError('试卷不存在')
        return dict(row)
    def ingest(raw, title, source):
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            im = Image.open(io.BytesIO(raw))
            if im.format not in ('PNG', 'JPEG', 'WEBP'):
                raise ValueError('仅支持 PNG/JPEG/WebP')
            if im.width * im.height > 24_000_000:
                raise ValueError('图片最多 2400 万像素')
            im = ImageOps.exif_transpose(im).convert('RGB')
        pid = uuid.uuid4().hex
        name = pid + '.jpg'
        (data / 'originals' / (pid + '.bin')).write_bytes(raw)
        (data / 'originals' / (pid + '.json')).write_text(json.dumps({'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'format': Image.open(io.BytesIO(raw)).format}), encoding='utf-8')
        im.save(data / 'images' / name, quality=92)  # EXIF removed
        with db() as conn:
            conn.execute('INSERT INTO papers VALUES(?,?,?,?,?,?)', (pid, title[:200], name, im.width, im.height, source))
        return paper(pid)
    @app.before_request
    def local_only():
        if request.host.split(':')[0] not in ('localhost', '127.0.0.1', '[::1]'):
            return jsonify(error='只允许本机访问'), 403
        origin = request.headers.get('Origin')
        if origin and origin != request.host_url.rstrip('/'):
            return jsonify(error='不允许跨站请求'), 403
    @app.errorhandler(413)
    def oversized(_):
        return jsonify(error='图片不能超过 12 MB'), 413
    @app.errorhandler(ValueError)
    def invalid(exc):
        return jsonify(error=str(exc)), 400
    @app.get('/')
    def index():
        return app.send_static_file('index.html')
    @app.get('/api/status')
    def status():
        executable = shutil.which('tesseract')
        langs = []
        if executable:
            result = subprocess.run([executable, '--list-langs'], capture_output=True, text=True, timeout=10)
            langs = result.stdout.splitlines()[1:]
        return jsonify(ocr=bool(executable), languages=langs, persistence='SQLite · 本机')
    @app.get('/api/papers')
    def papers():
        with db() as conn:
            rows = conn.execute('SELECT * FROM papers ORDER BY rowid DESC').fetchall()
        return jsonify([dict(r) for r in rows])
    @app.post('/api/upload')
    def upload():
        file = request.files.get('file')
        if not file:
            raise ValueError('请选择 PNG/JPEG/WebP 图片')
        try:
            result = ingest(file.read(), request.form.get('title', '新试卷'), 'upload')
        except (OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise ValueError('图片无效或尺寸过大')
        return jsonify(result), 201
    @app.post('/api/sample')
    def sample():
        return jsonify(ingest((ROOT / 'samples/exam.png').read_bytes(), '七年级数学 · 合成演示卷', 'synthetic')), 201
    @app.get('/images/<name>')
    def image(name):
        return send_from_directory(data / 'images', name)
    def region(payload, p):
        vals = payload.get('region', [0, 0, p['width'], p['height']])
        if not isinstance(vals, list) or len(vals) != 4 or any(type(v) not in (int, float) or not math.isfinite(v) for v in vals):
            raise ValueError('选区格式错误')
        x, y, w, h = map(int, vals)
        if x < 0 or y < 0 or w < 5 or h < 5 or x + w > p['width'] or y + h > p['height']:
            raise ValueError('请在图片内框选有效区域')
        return [x, y, w, h]
    @app.post('/api/ocr')
    def ocr():
        payload = request.get_json() or {}
        p = paper(payload.get('paper_id'))
        box = region(payload, p)
        if payload.get('mode') == 'sample':
            if p['source'] != 'synthetic':
                raise ValueError('预置文字只用于合成演示卷，不能识别上传图片')
            return jsonify(text='计算：(-3)² - 2 × 4 = ____。\n解方程：3x + 5 = 20。\n已知三角形两内角为 45°、65°，求第三个内角。', engine='预置演示文字（不是 OCR）', confidence=None)
        executable = shutil.which('tesseract')
        if not executable:
            raise ValueError('未安装本地 Tesseract，可直接手工录入')
        lang = payload.get('lang', 'eng')
        if lang not in ('eng', 'chi_sim+eng'):
            raise ValueError('不支持的 OCR 语言')
        im = Image.open(data / 'images' / p['image'])
        x, y, w, h = box
        buf = io.BytesIO()
        im.crop((x, y, x+w, y+h)).save(buf, format='PNG')
        try:
            result = subprocess.run([executable, 'stdin', 'stdout', '-l', lang, '--psm', '6'], input=buf.getvalue(), capture_output=True, timeout=45)
        except subprocess.TimeoutExpired:
            raise ValueError('OCR 超时，请缩小选区后重试')
        if result.returncode:
            raise ValueError('本地 OCR 失败，请确认已安装所选语言包（中文：chi_sim）')
        text = result.stdout.decode('utf-8').strip()
        (data / 'ocr' / (uuid.uuid4().hex + '.json')).write_text(json.dumps({'paper_id': p['id'], 'region': box, 'engine': 'tesseract', 'language': lang, 'raw_text': text}, ensure_ascii=False), encoding='utf-8')
        return jsonify(text=text, engine='Tesseract · 本地真实识别', confidence=None)
    @app.post('/api/questions')
    def save():
        payload = request.get_json() or {}
        p = paper(payload.get('paper_id'))
        payload['region'] = region(payload, p)
        fields = ('stem', 'student_answer', 'correct_answer', 'analysis', 'tags', 'reason', 'grading')
        for field in fields:
            if not isinstance(payload.get(field, ''), str) or len(payload.get(field, '')) > 20000:
                raise ValueError('字段内容无效或过长')
        if not payload.get('stem', '').strip() or payload.get('reviewed') is not True:
            raise ValueError('请填写题干，并确认已人工校对')
        clean = {key: payload.get(key, '') for key in fields}
        clean.update(region=payload['region'], reviewed=True, ocr_engine=str(payload.get('ocr_engine', '手工录入'))[:100])
        qid = uuid.uuid4().hex
        with db() as conn:
            conn.execute('INSERT INTO questions(id,paper_id,payload) VALUES(?,?,?)', (qid, p['id'], json.dumps(clean, ensure_ascii=False)))
        return jsonify(id=qid), 201
    @app.get('/api/questions')
    def questions():
        with db() as conn:
            rows = conn.execute('SELECT q.*,p.title,p.image FROM questions q JOIN papers p ON p.id=q.paper_id ORDER BY q.rowid DESC').fetchall()
        return jsonify([dict(r) | {'payload': json.loads(r['payload'])} for r in rows])
    @app.get('/api/export')
    def export():
        response = questions()
        response.headers['Content-Disposition'] = 'attachment; filename=wrong-questions.json'
        return response
    return app

if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=8765, debug=False)
