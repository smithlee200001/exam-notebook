import json
import uuid
from notebook.domain.blocks import validate, walk
from notebook.domain.answers import (
    validate_answer,
    answer_blocks,
    targets,
    status as answer_status,
)
from notebook.media.svg import decode_asset
from notebook.storage.database import connect
from notebook.storage import repository as repo


def answer(dbpath, qid, method, payload=None):
    with connect(dbpath) as db:
        # Lock the read/write transaction so targets and assets stay consistent.
        db.execute("BEGIN IMMEDIATE" if method != "GET" else "BEGIN")
        row = repo.get_question(db, qid)
        if row is None:
            return None
        q = repo.public_question(row)
        if method == "DELETE":
            repo.delete_answer(db, qid)
        elif method == "PUT":
            if not isinstance(payload, dict):
                raise ValueError("答案请求无效")
            a = validate_answer(payload.get("answer"), q)
            uploads = payload.get("assets", {})
            if not isinstance(uploads, dict):
                raise ValueError("图片资产格式无效")
            mapping = {}
            for b in walk(list(answer_blocks(a))):
                if b["type"] != "image":
                    continue
                aid = b["assetId"]
                if aid in uploads:
                    if aid not in mapping:
                        mime, raw = decode_asset(uploads[aid])
                        new = "asset_" + uuid.uuid4().hex
                        repo.insert_asset(db, new, qid, raw, mime)
                        mapping[aid] = new
                    b["assetId"] = mapping[aid]
                elif not repo.owns_asset(db, aid, qid):
                    raise ValueError("答案图片不存在或不属于当前题目")
            repo.put_answer(db, qid, a)
        saved = repo.get_answer(db, qid)
        a = json.loads(saved["content"]) if saved else None
        return dict(
            answer=a,
            updated_at=saved["updated_at"] if saved else None,
            targets=targets(q),
            status=answer_status(a, q),
        )


def preview(payload):
    if not isinstance(payload, dict):
        raise ValueError("答案请求无效")
    q = validate(payload.get("question"))
    a = validate_answer(payload.get("answer"), q)
    return dict(answer=a, status=answer_status(a, q))
