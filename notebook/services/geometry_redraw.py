"""Build a reviewable geometry draft from one extracted figure."""

import json
from pathlib import Path

from notebook.domain.geometry import SCHEMA, validate_geometry
from notebook.integrations import codex_cli
from notebook.media.images import clean_image


TEMPLATE = Path(__file__).resolve().parents[1] / "prompts" / "geometry_redraw.txt"

# Geometry point IDs are dynamic object keys. Send the domain schema in the
# prompt and validate locally, keeping the CLI's strict output envelope fixed.
RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "geometryJson": {"type": ["string", "null"]},
        "reason": {"type": "string"},
    },
    "required": ["geometryJson", "reason"],
    "additionalProperties": False,
}


def redraw_geometry(image_bytes, *, block_id, question_text):
    """Return (geometry, "") or (None, review_reason). CLI failures raise ValueError.
    """
    context = {"blockId": block_id, "questionText": question_text}
    prompt = "\n".join((
        TEMPLATE.read_text(encoding="utf-8"),
        json.dumps(SCHEMA, ensure_ascii=False),
        "题目上下文 JSON",
        json.dumps(context, ensure_ascii=False),
    ))

    def read_result(path):
        try:
            if path.stat().st_size > 1024 * 1024:
                raise ValueError("结果过大")
            result = json.loads(path.read_bytes(), object_pairs_hook=codex_cli._unique_object)
            if not isinstance(result, dict) or set(result) != {"geometryJson", "reason"}:
                raise ValueError("结果字段错误")
            reason = result["reason"]
            if not isinstance(reason, str):
                raise ValueError("复核说明无效")
            if result["geometryJson"] is None and reason.strip():
                return None, reason.strip()
            if reason or not isinstance(result["geometryJson"], str):
                raise ValueError("几何草稿格式错误")
            block = json.loads(result["geometryJson"], object_pairs_hook=codex_cli._unique_object)
            if not isinstance(block, dict) or block.get("id") != block_id:
                raise ValueError("图块 ID 不匹配")
            return validate_geometry(block), ""
        except (OSError, ValueError, TypeError, AttributeError, RecursionError) as exc:
            raise ValueError("几何图识别结果无效，请保留原图并复核") from exc

    return codex_cli.run_structured(clean_image(image_bytes), RESULT_SCHEMA, prompt, read_result)
