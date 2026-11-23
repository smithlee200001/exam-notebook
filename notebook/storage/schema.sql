-- Current SQLite schema. Initialization is idempotent; no legacy migration.
CREATE TABLE IF NOT EXISTS bank_question (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    kind TEXT NOT NULL,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bank_asset (
    id TEXT PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES bank_question(id),
    content BLOB NOT NULL,
    mime_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_answer (
    question_id INTEGER PRIMARY KEY REFERENCES bank_question(id),
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS worksheet (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    items TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bank_classification ON bank_question(subject, kind);
