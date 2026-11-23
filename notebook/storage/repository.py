"""SQL operations; callers supply the connection and transaction."""

import json


def get_question(db, qid):
    return db.execute("SELECT * FROM bank_question WHERE id=?", (qid,)).fetchone()


def list_questions(db):
    return db.execute("SELECT * FROM bank_question ORDER BY id DESC").fetchall()


def public_question(row):
    return dict(
        json.loads(row["content"]),
        id=row["id"],
        number=f"Q{row['id']:06d}",
        subject=row["subject"],
        kind=row["kind"],
        source=row["source"],
        created_at=row["created_at"],
    )


def insert_question(db, subject, kind, source, content):
    return db.execute(
        "INSERT INTO bank_question(subject,kind,source,content) VALUES(?,?,?,?)",
        (subject, kind, source, json.dumps(content, ensure_ascii=False)),
    ).lastrowid


def get_asset(db, aid):
    return db.execute(
        "SELECT content,mime_type FROM bank_asset WHERE id=?", (aid,)
    ).fetchone()


def insert_asset(db, aid, qid, raw, mime):
    db.execute(
        "INSERT INTO bank_asset(id,question_id,content,mime_type) VALUES(?,?,?,?)",
        (aid, qid, raw, mime),
    )


def owns_asset(db, aid, qid):
    return (
        db.execute(
            "SELECT 1 FROM bank_asset WHERE id=? AND question_id=?", (aid, qid)
        ).fetchone()
        is not None
    )


def get_answer(db, qid):
    return db.execute(
        "SELECT * FROM bank_answer WHERE question_id=?", (qid,)
    ).fetchone()


def delete_answer(db, qid):
    db.execute("DELETE FROM bank_answer WHERE question_id=?", (qid,))


def put_answer(db, qid, answer):
    db.execute(
        "INSERT INTO bank_answer(question_id,content) VALUES(?,?) ON CONFLICT(question_id) DO UPDATE SET content=excluded.content,updated_at=CURRENT_TIMESTAMP",
        (qid, json.dumps(answer, ensure_ascii=False)),
    )


def insert_worksheet(db, wid, title, items):
    db.execute(
        "INSERT INTO worksheet(id,title,items) VALUES(?,?,?)",
        (wid, title, json.dumps(items, ensure_ascii=False)),
    )


def list_worksheets(db):
    return db.execute(
        "SELECT id,title,created_at FROM worksheet ORDER BY rowid DESC"
    ).fetchall()


def get_worksheet(db, wid):
    return db.execute("SELECT * FROM worksheet WHERE id=?", (wid,)).fetchone()
