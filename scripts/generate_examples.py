"""Run with python -m scripts.generate_examples."""

import json
from pathlib import Path
from examples.questions import examples


def main():
    output = Path(__file__).resolve().parents[1] / "static/examples/questions.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(examples(), ensure_ascii=False, indent=2) + "\n")
    print(f"Generated {output}")


if __name__ == "__main__":
    main()
