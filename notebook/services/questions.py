import uuid
from notebook.domain.blocks import validate, walk
from notebook.domain.answers import (
    validate_answer,
    answer_blocks,
    status as answer_status,
)
from notebook.media.svg import decode_asset
from notebook.storage.database import connect
from notebook.storage import repository as repo
from notebook.services.common import string


def save_question(dbpath, payload):
    if not isinstance(payload, dict) or payload.get("reviewed") is not True:
        raise ValueError("请逐题校对题面、分类及图表后确认保存")
    q = validate(payload.get("question"))
    answer = (
        validate_answer(payload["answer"], q)
        if payload.get("answer") is not None
        else None
    )
    source = string(payload.get("source", ""), 200)
    uploads = payload.get("assets", {})
    if not isinstance(uploads, dict):
        raise ValueError("图片资产格式无效")
    with connect(dbpath) as db:
        assets, mapping = [], {}
        for b in walk(q["blocks"] + list(answer_blocks(answer))):
            if b["type"] != "image":
                continue
            original = b["assetId"]
            if original not in mapping:
                if original in uploads:
                    mime, raw = decode_asset(uploads[original])
                else:
                    row = repo.get_asset(db, original)
                    if row is None:
                        raise ValueError(f'{b["id"]}: 图片资产不存在，请上传图片')
                    mime, raw = row["mime_type"], row["content"]
                aid = "asset_" + uuid.uuid4().hex
                mapping[original] = aid
                assets.append((aid, raw, mime))
            b["assetId"] = mapping[original]
        subject, kind = q.pop("subject"), q.pop("kind")
        qid = repo.insert_question(db, subject, kind, source, q)
        for aid, raw, mime in assets:
            repo.insert_asset(db, aid, qid, raw, mime)
        if answer is not None:
            repo.put_answer(db, qid, answer)

    return dict(id=qid, number=f"Q{qid:06d}")


def list_questions(dbpath):
    with connect(dbpath) as db:
        return [repo.public_question(row) for row in repo.list_questions(db)]


def preview(payload):
    if isinstance(payload, dict) and "question" in payload:
        q = validate(payload["question"])
        a = (
            validate_answer(payload["answer"], q)
            if payload.get("answer") is not None
            else None
        )
        return dict(question=q, answer=a, status=answer_status(a, q))
    return validate(payload)
