import base64
import io
import json
from pathlib import Path

from PIL import Image
import pytest
from examples.questions import examples
from notebook.domain.blocks import validate
from notebook.domain.geometry import validate_geometry


def png_pixels(content):
    raw = base64.b64decode(content, validate=True)
    with Image.open(io.BytesIO(raw), formats=["PNG"]) as image:
        assert image.n_frames == 1
        if image.mode == "P" or "transparency" in image.info:
            return image.size, image.mode, image.convert("RGBA").tobytes()
        return image.size, image.mode, image.tobytes()


def comparable_examples(questions):
    # PNG compression can vary by build even when the saved raster is identical.
    # Normalize only PNG payloads; keep all other fixture fields exact.
    result = []
    for question in questions:
        if "assets" in question:
            question = dict(
                question,
                assets={
                    key: dict(asset, content=png_pixels(asset["content"]))
                    if asset["mimeType"] == "image/png"
                    else asset
                    for key, asset in question["assets"].items()
                },
            )
        result.append(question)
    return result


def test_generated_examples_match_sources():
    root = Path(__file__).resolve().parents[2]
    checked_in = json.loads((root / "static/examples/questions.json").read_text())
    assert comparable_examples(checked_in) == comparable_examples(examples())


def test_png_comparison_checks_pixels_not_compression():
    image = Image.new("RGB", (8, 8), "white")

    def encode(raster, compress_level=6):
        out = io.BytesIO()
        raster.save(out, format="PNG", compress_level=compress_level)
        return base64.b64encode(out.getvalue())

    baseline = encode(image, compress_level=0)
    compressed = encode(image, compress_level=9)
    assert baseline != compressed
    assert png_pixels(baseline) == png_pixels(compressed)

    pixel_changed = image.copy()
    pixel_changed.putpixel((0, 0), (0, 0, 0))
    for changed in (image.resize((7, 8)), image.convert("RGBA"), pixel_changed):
        assert png_pixels(baseline) != png_pixels(encode(changed))


@pytest.mark.parametrize(
    "change",
    [
        lambda g: g.update(version=2),
        lambda g: g.update(onload="alert(1)"),
        lambda g: g["points"]["A"].update(x=float("nan")),
        lambda g: g["segments"][0].update(to="missing"),
        lambda g: g["segments"][1].update(id=g["segments"][0]["id"]),
        lambda g: g["segments"][0].update(to="A"),
        lambda g: g["rightAngles"][0].update(arms=["B", "B"]),
        lambda g: g["givens"][0].update(segment="missing"),
        lambda g: g["givens"][0].update(value=-1),
    ],
)
def test_geometry_validation(change):
    q = examples()[11]
    q.pop("answer")
    change(q["blocks"][1])
    with pytest.raises(ValueError):
        validate(q)


def test_geometry_defaults_and_no_unit():
    g = examples()[11]["blocks"][1]
    g.pop("display")
    result = validate_geometry(g)
    assert result["display"]["widthPercent"] == 60
    assert result["circles"] == []
    assert result["segments"][0]["dashed"] is False
    assert "unit" not in result["givens"][0]
