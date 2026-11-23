"""Paths remain relative to the repository, regardless of working directory."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def data_directory(override=None):
    return Path(
        override or os.environ.get("EXAM_DATA_DIR", ROOT / "data" / "blocks-v2")
    )
