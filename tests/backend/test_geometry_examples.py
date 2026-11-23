import copy
import json
from pathlib import Path
import pytest
from examples.questions import examples
from notebook.domain.blocks import validate
from notebook.domain.geometry import validate_geometry


def test_generated_examples_match_sources():
    root = Path(__file__).resolve().parents[2]
    assert (
        json.loads((root / "static/examples/questions.json").read_text()) == examples()
    )


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
