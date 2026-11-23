"""Load local schemas and resolve references without network access."""

import json
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).parent
BASE = "https://exam-notebook.local/schemas/"


def load(name):
    return json.loads((ROOT / f"{name}.schema.json").read_text())


REGISTRY = Registry().with_resources(
    (
        BASE + p.name,
        Resource.from_contents(
            json.loads(p.read_text()), default_specification=DRAFT202012
        ),
    )
    for p in ROOT.glob("*.schema.json")
)


def validator(schema):
    return Draft202012Validator(
        {"$id": BASE + "inline.schema.json", **schema}, registry=REGISTRY
    )
