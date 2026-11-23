"""Validate image uploads; SVG accepts a small self-contained drawing subset."""

import base64
import binascii
import xml.etree.ElementTree as ET
from notebook.media.images import clean_image

TAGS = {
    "svg",
    "g",
    "title",
    "desc",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
}
ATTRS = {
    "viewBox",
    "width",
    "height",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "d",
    "points",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "transform",
    "font-size",
    "font-family",
    "font-weight",
    "text-anchor",
    "dx",
    "dy",
    "preserveAspectRatio",
}


def decode_asset(asset):
    if not isinstance(asset, dict) or set(asset) != {"mimeType", "content"}:
        raise ValueError("图片上传需要 mimeType 和 Base64 content")
    try:
        raw = base64.b64decode(asset["content"], validate=True)
    except (ValueError, TypeError, binascii.Error):
        raise ValueError("图片编码无效") from None
    if len(raw) > 4 * 1024 * 1024:
        raise ValueError("图片不能超过 4 MB")
    mime = asset["mimeType"]
    if mime == "image/svg+xml":
        if b"<!" in raw or b"<?" in raw:
            raise ValueError("SVG 不允许声明、实体或处理指令")
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            raise ValueError("SVG 格式无效") from None
        if root.tag not in ("svg", "{http://www.w3.org/2000/svg}svg"):
            raise ValueError("需要 SVG 根元素")
        for node in root.iter():
            if node.tag.startswith("{") and not node.tag.startswith(
                "{http://www.w3.org/2000/svg}"
            ):
                raise ValueError("SVG 命名空间无效")
            if node.tag.split("}")[-1] not in TAGS:
                raise ValueError("SVG 含不支持的元素")
            for key, value in node.attrib.items():
                if key not in ATTRS or any(
                    s in value.lower()
                    for s in ("url(", "javascript:", "data:", "http:", "https:")
                ):
                    raise ValueError("SVG 含不支持的属性或外部引用")
        # Serialize parsed XML; original markup is never served unchecked.
        return mime, ET.tostring(root, encoding="utf-8")
    if mime not in ("image/png", "image/jpeg", "image/webp"):
        raise ValueError("图片格式只支持 PNG、JPEG、WebP 或 SVG")
    return "image/png", clean_image(raw)
