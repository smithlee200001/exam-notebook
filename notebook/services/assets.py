"""Asset normalization and lookup, independent of HTTP responses."""

import base64
from notebook.media.svg import decode_asset
from notebook.storage.database import connect
from notebook.storage.repository import get_asset


def normalize(payload):
    mime, raw = decode_asset(payload)
    return {"mimeType": mime, "content": base64.b64encode(raw).decode()}


def get(dbpath, aid):
    with connect(dbpath) as db:
        row = get_asset(db, aid)
    return dict(row) if row is not None else None
