"""Validate versioned geometry blocks; screen coordinates are not physical units."""

import copy
import math


from notebook.schemas.registry import load, validator

SCHEMA = load("geometry")
VALIDATOR = validator(SCHEMA)


def validate_geometry(block):
    def finite(value):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("几何坐标必须是有限数值")
        if isinstance(value, dict):
            for v in value.values():
                finite(v)
        elif isinstance(value, list):
            for v in value:
                finite(v)

    block = copy.deepcopy(block)
    if isinstance(block, dict) and "display" not in block:
        block["display"] = {"widthPercent": 60, "align": "center"}
    for key in ("segments", "circles", "polygons", "labels", "rightAngles", "givens"):
        block.setdefault(key, [])
    for element in block["segments"] + block["circles"]:
        element.setdefault("dashed", False)
    finite(block)
    error = next(VALIDATOR.iter_errors(block), None)
    if error:
        path = ".".join(map(str, error.absolute_path)) or "geometry"
        raise ValueError(f"几何 JSON 格式无效：{path}")
    points = block["points"]
    segments = {}
    ids = set()

    def point(key):
        if key not in points:
            raise ValueError(f"几何图引用不存在的点：{key}")
        return points[key]

    def distinct(a, b):
        p, q = point(a), point(b)
        if p["x"] == q["x"] and p["y"] == q["y"]:
            raise ValueError("几何线段的两个端点不能重合")

    for element in block["segments"] + block["circles"]:
        if element["id"] in ids:
            raise ValueError("几何元素 ID 不能重复")
        ids.add(element["id"])
    for segment in block["segments"]:
        distinct(segment["from"], segment["to"])
        segments[segment["id"]] = segment
    for circle in block["circles"]:
        point(circle["center"])
    for polygon in block["polygons"]:
        refs = polygon["points"]
        if len(set(refs)) != len(refs):
            raise ValueError("多边形顶点不能重复")
        for key in refs:
            point(key)
    for angle in block["rightAngles"] + block.get("angleArcs", []):
        distinct(angle["vertex"], angle["arms"][0])
        distinct(angle["vertex"], angle["arms"][1])
        if angle["arms"][0] == angle["arms"][1]:
            raise ValueError("角标需要两条不同的边")
    for given in block["givens"]:
        refs = [given["segment"]] if given["type"] == "length" else given["segments"]
        if any(key not in segments for key in refs):
            raise ValueError("已知条件引用了不存在的线段")
        if len(refs) == 2 and refs[0] == refs[1]:
            raise ValueError("垂直条件需要两条不同的线段")
    return copy.deepcopy(block)
