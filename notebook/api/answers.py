from flask import jsonify, request
from . import bp, dbpath
from notebook.services import answers


@bp.post("/answers/validate")
def answers_preview():
    return jsonify(answers.preview(request.get_json(silent=True)))


@bp.route("/questions/<int:qid>/answer", methods=["GET", "PUT", "DELETE"])
def answers_answer(qid):
    result = answers.answer(
        dbpath(), qid, request.method, request.get_json(silent=True)
    )
    return (jsonify(error="题目不存在"), 404) if result is None else jsonify(result)
