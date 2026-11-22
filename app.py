"""Local question bank and worksheet application."""
import os
from pathlib import Path

from flask import Flask, jsonify, request

import codex_ocr
from bank import make_bank

ROOT = Path(__file__).resolve().parent


def create_app(data_dir=None):
    app = Flask(__name__, static_folder='static')
    app.config['MAX_CONTENT_LENGTH'] = 12 * 1024 * 1024
    data = Path(data_dir or os.environ.get('EXAM_DATA_DIR', ROOT / 'data' / 'blocks-v2'))
    data.mkdir(parents=True, exist_ok=True)
    dbpath = data / 'notebook.sqlite3'

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
        return app.send_static_file('bank.html')

    @app.get('/api/status')
    def status():
        return jsonify(codex_ocr.status())

    app.register_blueprint(make_bank(dbpath))
    return app


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=8765, debug=False)
