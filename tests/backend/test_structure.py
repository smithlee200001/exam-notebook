"""Contracts that protect the directory refactor and shared schemas."""

import json
import re
from pathlib import Path
from examples.questions import examples
from notebook import create_app
from notebook.domain.answers import targets, validate_answer
from notebook.domain.blocks import validate
from notebook.schemas.registry import load, validator

ROOT = Path(__file__).resolve().parents[2]


def test_answer_targets_match_shared_fixture():
    expected = json.loads((ROOT / "tests/fixtures/answer-targets.json").read_text())
    actual = []
    for question in examples():
        result = targets(question)
        for target in result:
            if "options" in target:
                target["optionIds"] = [o["id"] for o in target.pop("options")]
        actual.append({"sourceNumber": question["sourceNumber"], "targets": result})
    assert actual == expected


def test_static_entry_and_all_module_imports_are_served(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    client = create_app(tmp_path / "db").test_client()
    page = client.get("/").text
    assert 'type="module"' in page
    for url in re.findall(r'(?:src|href)="(/static/[^"]+)"', page):
        assert client.get(url).status_code == 200, url
    for path in (ROOT / "static/js").rglob("*.js"):
        for relative in re.findall(r'from\s+[\'"]([^\'"]+)[\'"]', path.read_text()):
            target = (path.parent / relative).resolve().relative_to(ROOT)
            assert client.get("/" + str(target)).status_code == 200, str(target)
    fixture = ROOT / "static/examples/questions.json"
    assert client.get("/static/examples/questions.json").data == fixture.read_bytes()


def test_shared_block_schema_resolves_in_questions_and_answers():
    assert "$defs" not in load("question")
    assert "$defs" not in load("answer")
    for question in examples():
        answer = question.pop("answer")
        question.pop("assets", None)
        question = validate(question)
        answer = validate_answer(answer, question)
        validator(load("question")).validate(question)
        validator(load("answer")).validate(answer)
