"""HTTP boundary; domain and service modules do not import Flask."""

from flask import Blueprint, current_app

bp = Blueprint("bank", __name__, url_prefix="/api/bank")


def dbpath():
    return current_app.config["DATABASE"]


@bp.after_request
def no_cache(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


from . import questions, answers, worksheets, assets, extraction
