from flask import jsonify, request
from . import bp, dbpath
from notebook.services import questions


@bp.post("/validate")
def questions_preview():
    return jsonify(questions.preview(request.get_json(silent=True)))


@bp.post("/questions")
def questions_save():
    return (
        jsonify(questions.save_question(dbpath(), request.get_json(silent=True))),
        201,
    )


@bp.get("/questions")
def questions_listing():
    return jsonify(questions.list_questions(dbpath()))
