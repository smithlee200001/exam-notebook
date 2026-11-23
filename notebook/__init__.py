"""Local question bank and worksheet application."""

from flask import Flask, jsonify, request

from notebook.integrations import codex_cli
from notebook.config import ROOT, data_directory
from notebook.storage.database import initialize
from notebook.api import bp


def create_app(data_dir=None):
    app = Flask(__name__, static_folder=str(ROOT / "static"))
    app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024
    data = data_directory(data_dir)
    data.mkdir(parents=True, exist_ok=True)
    dbpath = data / "notebook.sqlite3"
    initialize(dbpath)
    app.config["DATABASE"] = dbpath

    @app.before_request
    def local_only():
        if request.host.split(":")[0] not in ("localhost", "127.0.0.1", "[::1]"):
            return jsonify(error="只允许本机访问"), 403
        origin = request.headers.get("Origin")
        if origin and origin != request.host_url.rstrip("/"):
            return jsonify(error="不允许跨站请求"), 403

    @app.errorhandler(413)
    def oversized(_):
        return jsonify(error="图片不能超过 12 MB"), 413

    @app.errorhandler(ValueError)
    def invalid(exc):
        return jsonify(error=str(exc)), 400

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    @app.get("/api/status")
    def status():
        return jsonify(codex_cli.status())

    app.register_blueprint(bp)
    return app
