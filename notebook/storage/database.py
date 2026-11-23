"""SQLite lifecycle. Transactions belong to the calling service."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def connect(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize(path):
    with connect(path) as db:
        db.executescript(Path(__file__).with_name("schema.sql").read_text())
        if "mime_type" not in {
            row["name"] for row in db.execute("PRAGMA table_info(bank_asset)")
        }:
            raise ValueError(
                "此目录包含旧版数据库，请使用新的 EXAM_DATA_DIR；不会迁移或修改旧数据"
            )
