from flask import jsonify, request
from . import bp, dbpath
from notebook.services import worksheets


@bp.post("/worksheets")
def worksheets_compose():
    return jsonify(worksheets.compose(dbpath(), request.get_json(silent=True))), 201


@bp.get("/worksheets")
def worksheets_listing():
    return jsonify(worksheets.listing(dbpath()))


@bp.get("/worksheets/<wid>")
def worksheets_get(wid):
    result = worksheets.get(dbpath(), wid)
    return (jsonify(error="练习卷不存在"), 404) if result is None else jsonify(result)
