"""Standard answers linked to stable question nodes, never positional labels."""

import copy
from notebook.domain.blocks import walk, validate_blocks

from notebook.schemas.registry import load, validator

SCHEMA = load("answer")
VALIDATOR = validator(SCHEMA)


def targets(question):
    result = []

    def visit(nodes, prefix=""):
        blanks = 0
        for b in nodes:
            t = b["type"]
            if t == "options":
                result.append(
                    dict(
                        target="block",
                        targetId=b["id"],
                        type="choice",
                        label=prefix + "选择题",
                        mode=b["mode"],
                        options=b["children"],
                    )
                )
            elif t == "blank":
                blanks += 1
                result.append(
                    dict(
                        target="block",
                        targetId=b["id"],
                        type="fill",
                        label=prefix + f"第{blanks}空",
                    )
                )
            elif t == "subquestions":
                for i, part in enumerate(b["children"], 1):
                    before = len(result)
                    visit(part.get("children", []), f"{prefix}（{i}）")
                    if len(result) == before:
                        result.append(
                            dict(
                                target="block",
                                targetId=part["id"],
                                type="solution",
                                label=f"{prefix}（{i}）解答",
                            )
                        )
            else:
                visit(b.get("children", []), prefix)

    visit(question["blocks"])
    if not result:
        result.append(dict(target="question", type="solution", label="整题解答"))
    # Number all blanks within the same small question, including table cells.
    counts = {}
    for t in result:
        if t["type"] == "fill":
            prefix = t["label"].rsplit("第", 1)[0]
            counts[prefix] = counts.get(prefix, 0) + 1
            t["label"] = prefix + f"第{counts[prefix]}空"
    return result


def key(entry):
    return entry.get("targetId") if entry["target"] == "block" else "@question"


def answer_blocks(answer):
    if answer:
        for e in answer["entries"]:
            yield from e.get("blocks", [])
            yield from e.get("explanation", [])


def validate_answer(answer, question):
    result = copy.deepcopy(answer)

    def defaults(value):
        if isinstance(value, dict):
            if value.get("type") == "geometry":
                for field in (
                    "segments",
                    "circles",
                    "polygons",
                    "labels",
                    "rightAngles",
                    "givens",
                ):
                    value.setdefault(field, [])
            for child in value.values():
                defaults(child)
        elif isinstance(value, list):
            for child in value:
                defaults(child)

    defaults(result)
    error = next(VALIDATOR.iter_errors(result), None)
    if error:
        raise ValueError(
            "answer."
            + ".".join(map(str, error.absolute_path))
            + ": "
            + error.message[:250]
        )
    expected = {key(t): t for t in targets(question)}
    seen = set()
    block_ids = set()
    for i, e in enumerate(result["entries"]):
        path = f"entries[{i}]"
        k = key(e)
        if k in seen:
            raise ValueError(path + ": 答案目标重复")
        seen.add(k)
        t = expected.get(k)
        if not t or t["type"] != e["type"]:
            raise ValueError(
                path + ".targetId: 目标不存在、类型不匹配或与细分作答目标重叠"
            )
        if e["type"] == "choice":
            options = {b["id"] for b in t["options"]}
            if len(set(e["optionIds"])) != len(e["optionIds"]):
                raise ValueError(path + ".optionIds: 选项不能重复")
            if t["mode"] == "single" and len(e["optionIds"]) != 1:
                raise ValueError(path + ".optionIds: 单选只能有一个答案")
            for j, oid in enumerate(e["optionIds"]):
                if oid not in options:
                    raise ValueError(f"{path}.optionIds[{j}]: 选项不属于目标选项组")
        if e["type"] == "fill":
            if not e["text"].strip():
                raise ValueError(path + ".text: 标准答案不能为空")
            e.setdefault("alternatives", [])
            if any(not s.strip() for s in e["alternatives"]):
                raise ValueError(path + ".alternatives: 表达不能为空")
        for field in ("blocks", "explanation"):
            if field not in e:
                continue
            if field == "explanation" and not e[field]:
                continue
            try:
                e[field] = validate_blocks(e[field])
            except (ValueError, TypeError, KeyError) as exc:
                raise ValueError(f"{path}.{field}: {exc}") from None

            def allowed(nodes, parent=None):
                for b in nodes:
                    if b["type"] not in {
                        "text",
                        "image",
                        "geometry",
                        "chart",
                        "table",
                        "icon",
                        "row",
                        "cell",
                    }:
                        raise ValueError(path + ": 答案正文不接受作答节点")
                    if (
                        b["type"] == "row"
                        and parent != "table"
                        or b["type"] == "cell"
                        and parent != "row"
                    ):
                        raise ValueError(path + ": 行和单元格只能出现在表格中")
                    if b["id"] in block_ids:
                        raise ValueError(path + ": 答案内容 ID 重复")
                    block_ids.add(b["id"])
                    allowed(b.get("children", []), b["type"])

            allowed(e[field])
    return result


def status(answer, question):
    ts = targets(question)
    answered = {key(e) for e in answer["entries"]} if answer else set()
    missing = [t for t in ts if key(t) not in answered]
    return dict(
        state="none" if not answered else "partial" if missing else "complete",
        answered=len(answered),
        total=len(ts),
        missing=missing,
    )
