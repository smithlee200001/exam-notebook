from flask import jsonify, request, Response
from . import bp, dbpath
from notebook.services import assets


@bp.post("/assets/validate")
def assets_validate_upload():
    return jsonify(assets.normalize(request.get_json(silent=True)))


@bp.get("/assets/<aid>")
def assets_asset(aid):
    row = assets.get(dbpath(), aid)
    if row is None:
        return jsonify(error="图表不存在"), 404
    response = Response(row["content"], mimetype=row["mime_type"])
    response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return response
