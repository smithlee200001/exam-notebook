import json
import uuid
from notebook.storage.database import connect
from notebook.storage import repository as repo
from notebook.services.common import string


def compose(dbpath, payload):
    if not isinstance(payload, dict):
        raise ValueError("组卷数据无效")
    title = string(payload.get("title", ""), 200) or "数学练习卷"
    items = payload.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= 100:
        raise ValueError("请选择 1～100 道题")
    result, seen = [], set()
    with connect(dbpath) as db:
        db.execute("BEGIN IMMEDIATE")
        for item in items:
            if not isinstance(item, dict) or type(item.get("id")) is not int:
                raise ValueError("题目编号无效")
            qid = item["id"]
            lines = item.get("lines", 4)
            if qid in seen or type(lines) is not int or not 0 <= lines <= 20:
                raise ValueError("题目重复或作答行数无效")
            seen.add(qid)
            row = repo.get_question(db, qid)
            if row is None:
                raise ValueError("选中的题目不存在")
            saved = repo.get_answer(db, qid)
            result.append(
                {
                    "question": repo.public_question(row),
                    "answer": json.loads(saved["content"]) if saved else None,
                    "lines": lines,
                }
            )
        wid = uuid.uuid4().hex
        repo.insert_worksheet(db, wid, title, result)
    return dict(id=wid)


def listing(dbpath):
    with connect(dbpath) as db:
        return [dict(row) for row in repo.list_worksheets(db)]


def get(dbpath, wid):
    with connect(dbpath) as db:
        row = repo.get_worksheet(db, wid)
    if row is None:
        return None
    return dict(id=row["id"], title=row["title"], items=json.loads(row["items"]))
