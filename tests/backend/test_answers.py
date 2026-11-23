import copy
import json
import sqlite3
import pytest
from app import create_app
from notebook.domain.answers import targets, validate_answer, status
from examples.questions import examples
from notebook.domain.blocks import walk


def split(q):
    q = copy.deepcopy(q)
    return q, q.pop("answer"), q.pop("assets", {})


def save(c, q):
    q, a, assets = split(q)
    r = c.post(
        "/api/bank/questions",
        json={"question": q, "answer": a, "assets": assets, "reviewed": True},
    )
    assert r.status_code == 201, r.json
    return r.json["id"]


def test_all_examples_have_valid_complete_answers_and_snapshot(tmp_path):
    c = create_app(tmp_path).test_client()
    ids = []
    for q in examples():
        assert status(validate_answer(q["answer"], q), q)["state"] == "complete"
        qid = save(c, q)
        ids.append(qid)
        result = c.get(f"/api/bank/questions/{qid}/answer").json
        assert result["status"]["state"] == "complete"
        assert all(e.get("explanation") for e in result["answer"]["entries"])
    r = c.post("/api/bank/worksheets", json={"items": [{"id": i} for i in ids]})
    assert r.status_code == 201
    sheet = (
        create_app(tmp_path)
        .test_client()
        .get("/api/bank/worksheets/" + r.json["id"])
        .json
    )
    assert all(i["answer"] for i in sheet["items"])
    for item in sheet["items"]:
        assert status(item["answer"], item["question"])["state"] == "complete"


def test_answer_updates_partial_delete_and_immutable_snapshot(tmp_path):
    c = create_app(tmp_path).test_client()
    q = examples()[1]
    qid = save(c, q)
    wid = c.post("/api/bank/worksheets", json={"items": [{"id": qid}]}).json["id"]
    old = c.get("/api/bank/worksheets/" + wid).json
    partial = copy.deepcopy(q["answer"])
    partial["entries"] = partial["entries"][:1]
    r = c.put(f"/api/bank/questions/{qid}/answer", json={"answer": partial})
    assert r.status_code == 200 and r.json["status"]["state"] == "partial"
    assert len(r.json["status"]["missing"]) == 2
    c.delete(f"/api/bank/questions/{qid}/answer")
    assert c.get(f"/api/bank/questions/{qid}/answer").json["answer"] is None
    assert c.get("/api/bank/worksheets/" + wid).json == old
    new = c.post("/api/bank/worksheets", json={"items": [{"id": qid}]}).json["id"]
    assert c.get("/api/bank/worksheets/" + new).json["items"][0]["answer"] is None


@pytest.mark.parametrize(
    "mutate",
    [
        lambda a: a["entries"][0].update(targetId="missing"),
        lambda a: a["entries"][0].update(optionIds=["not_an_option"]),
        lambda a: a["entries"][0].update(optionIds=["q3_b3", "q3_b4"]),
        lambda a: a["entries"].append(copy.deepcopy(a["entries"][0])),
        lambda a: a["entries"][0].update(target="question"),
    ],
)
def test_invalid_answers_leave_saved_document_unchanged(tmp_path, mutate):
    c = create_app(tmp_path).test_client()
    q = examples()[2]
    qid = save(c, q)
    before = c.get(f"/api/bank/questions/{qid}/answer").json
    mutate(q["answer"])
    r = c.put(f"/api/bank/questions/{qid}/answer", json={"answer": q["answer"]})
    assert r.status_code == 400
    assert c.get(f"/api/bank/questions/{qid}/answer").json == before


def test_solution_target_overlap_and_block_ids_rejected():
    q = examples()[5]
    a = {
        "schemaVersion": 1,
        "entries": [
            {
                "target": "question",
                "type": "solution",
                "blocks": [{"id": "s", "type": "text", "version": 1, "text": "x"}],
            }
        ],
    }
    with pytest.raises(ValueError, match="重叠"):
        validate_answer(a, q)
    q = examples()[11]
    a = q["answer"]
    a["entries"][1]["blocks"][0]["id"] = a["entries"][0]["explanation"][0]["id"]
    with pytest.raises(ValueError, match="ID 重复"):
        validate_answer(a, q)


def test_asset_ownership_and_rollback(tmp_path):
    c = create_app(tmp_path).test_client()
    id1 = save(c, examples()[12])
    id2 = save(c, examples()[0])
    rows = c.get("/api/bank/questions").json
    aid = next(
        b["assetId"]
        for b in walk(next(q for q in rows if q["id"] == id1)["blocks"])
        if b["type"] == "image"
    )
    a = c.get(f"/api/bank/questions/{id2}/answer").json["answer"]
    a["entries"][0]["explanation"] = [
        {"id": "foreign", "type": "image", "version": 1, "assetId": aid, "alt": "x"}
    ]
    assert (
        c.put(f"/api/bank/questions/{id2}/answer", json={"answer": a}).status_code
        == 400
    )
    assets = examples()[12]["assets"]
    a["entries"][0]["explanation"][0]["assetId"] = "new"
    a["entries"][0]["explanation"].append(
        {"id": "bad", "type": "image", "version": 1, "assetId": "missing", "alt": "x"}
    )
    with sqlite3.connect(tmp_path / "notebook.sqlite3") as db:
        before = db.execute("select count(*) from bank_asset").fetchone()[0]
    assert (
        c.put(
            f"/api/bank/questions/{id2}/answer",
            json={"answer": a, "assets": {"new": assets["asset_svg"]}},
        ).status_code
        == 400
    )
    with sqlite3.connect(tmp_path / "notebook.sqlite3") as db:
        assert db.execute("select count(*) from bank_asset").fetchone()[0] == before
    a["entries"][0]["explanation"].pop()
    assert (
        c.put(
            f"/api/bank/questions/{id2}/answer",
            json={"answer": a, "assets": {"new": assets["asset_svg"]}},
        ).status_code
        == 200
    )


def test_target_order_uses_ids_after_option_reorder():
    q = examples()[2]
    a = q["answer"]
    correct = a["entries"][0]["optionIds"][0]
    q["blocks"][1]["children"].reverse()
    assert validate_answer(a, q)["entries"][0]["optionIds"] == [correct]
    assert targets(q)[0]["options"][2]["id"] == correct


def test_missing_question_and_empty_answer(tmp_path):
    c = create_app(tmp_path).test_client()
    for method in ("get", "put", "delete"):
        assert (
            getattr(c, method)("/api/bank/questions/999/answer", json={}).status_code
            == 404
        )
    qid = save(c, examples()[0])
    assert (
        c.put(
            f"/api/bank/questions/{qid}/answer",
            json={"answer": {"schemaVersion": 1, "entries": []}},
        ).status_code
        == 400
    )


def test_initial_question_and_answer_save_is_atomic(tmp_path):
    c = create_app(tmp_path).test_client()
    q, a, assets = split(examples()[2])
    a["entries"][0]["optionIds"] = ["missing"]
    r = c.post(
        "/api/bank/questions",
        json={"question": q, "answer": a, "assets": assets, "reviewed": True},
    )
    assert r.status_code == 400
    assert c.get("/api/bank/questions").json == []
    with sqlite3.connect(tmp_path / "notebook.sqlite3") as db:
        assert db.execute("select count(*) from bank_answer").fetchone()[0] == 0


def test_example_supplement_is_idempotent_and_keeps_existing_answers(tmp_path):
    from scripts.supplement_example_answers import supplement

    app = create_app(tmp_path)
    c = app.test_client()
    q, a, assets = split(examples()[12])
    qid = c.post(
        "/api/bank/questions", json={"question": q, "assets": assets, "reviewed": True}
    ).json["id"]
    assert supplement(app) == 1
    saved = c.get(f"/api/bank/questions/{qid}/answer").json
    assert supplement(app) == 0
    assert c.get(f"/api/bank/questions/{qid}/answer").json == saved


def test_solve_fills_only_missing_targets_and_reuses_answer(tmp_path, monkeypatch):
    from notebook.integrations import codex_cli

    c = create_app(tmp_path).test_client()
    q, a, assets = split(examples()[1])
    *original, missing = a["entries"]
    saved = c.post("/api/bank/questions", json={
        "question": q, "reviewed": True, "assets": assets,
        "answer": dict(schemaVersion=1, entries=original),
    })
    url = f"/api/bank/questions/{saved.json['id']}/answer"
    calls = []

    def generate(images, schema, prompt, reader):
        calls.append(prompt)
        path = tmp_path / "model-result.json"
        path.write_text(json.dumps({"entries": [{
            "target": missing["targetId"], "text": missing["text"],
            "optionIds": [], "explanation": "计算得到。",
        }]}))
        return reader(path)

    monkeypatch.setattr(codex_cli, "run_structured", generate)
    before = c.get(url).json["answer"]["entries"][0]
    result = c.post(url + "/solve")
    assert result.status_code == 200, result.json
    assert result.json["status"]["state"] == "complete"
    assert result.json["answer"]["entries"][0] == before
    assert c.post(url + "/solve").json == c.get(url).json == result.json
    assert len(calls) == 1


def test_solve_rejects_incomplete_model_result(tmp_path, monkeypatch):
    from notebook.integrations import codex_cli

    c = create_app(tmp_path).test_client()
    q, _, _ = split(examples()[0])
    saved = c.post("/api/bank/questions", json={"question": q, "reviewed": True})
    url = f"/api/bank/questions/{saved.json['id']}/answer"
    path = tmp_path / "empty.json"
    path.write_text('{"entries":[]}')
    monkeypatch.setattr(codex_cli, "run_structured", lambda imgs, s, p, read: read(path))
    assert c.post(url + "/solve").status_code == 400
    assert c.get(url).json["answer"] is None
