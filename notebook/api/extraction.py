from flask import jsonify, request
from . import bp
from notebook.media.images import clean_image
from notebook.services.extraction import extract


@bp.post("/extract")
def extraction_extraction():
    if request.mimetype != "application/octet-stream":
        raise ValueError("请发送图片二进制")
    png = clean_image(request.stream.read(4 * 1024 * 1024 + 1))
    return jsonify(questions=extract(png))
