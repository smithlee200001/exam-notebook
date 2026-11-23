"""Reviewed reference answers for the sixteen offline examples; no auto grading."""

import copy
from notebook.domain.answers import targets

SPECS = [
    [("7", "3 与 4 相加，得到 7。")],
    [
        ("9", r"\((-3)^2=(-3)\times(-3)=9\)。"),
        ("7", r"\(7^2=49\)，所以算术平方根为7。"),
        ("5", "绝对值表示到原点的距离，结果为5。"),
    ],
    [([1], r"\(\frac{1}{2}=0.5\)。")],
    [([0, 1, 3], "2、3、5都只有1和自身两个正因数，4还有因数2。")],
    [
        ("先理解题意，确定运算，再计算并检查结果。", "这是开放式表达，方法合理即可。"),
        ("7", r"\(3+4=7\)。"),
    ],
    [
        ([1], "4能被2整除，是偶数；3是奇数。"),
        (
            "1",
            "示例答案；奇数不能被2整除。两个空可填写其他符合题意的奇数，本版不自动判分。",
        ),
        ("3", "示例答案；也可填写5、7等奇数，应结合整个小问人工核对。"),
    ],
    [
        (
            r"\(a=7\)，\(S=32\)。",
            r"\(3+4=7\)；矩形面积为\(8\times4=32\)。本题也用于比较公式布局。",
        )
    ],
    [("7", r"\(3+4=7\)。"), ("12", r"\(3\times4=12\)。")],
    [
        (r"\(ab\)", "空格前已经有S=，此空填写长乘宽。"),
        (r"\(S=\pi r^2\)", "圆的面积等于圆周率乘以半径的平方。"),
    ],
    [
        ("4", "第四组有9人，比其他三组都多。"),
        ("28", r"\(6+8+5+9=28\)。"),
        ("7", r"平均人数为\(28\div4=7\)。"),
    ],
    [
        ("第二组。", "各组男生人数为3、5、2、4，最大值5对应第二组。"),
        ("第一组。", "第一组男生、女生均为3人，其余各组人数不同。"),
    ],
    [
        ("5", r"由勾股定理，\(BC=\sqrt{4^2+3^2}=5\)。"),
        (
            r"\(S=\frac{1}{2}\times4\times3=6\)。",
            "两条直角边相互垂直，可分别作为底与高。",
        ),
    ],
    [([0], "图一有四条边且四个角都是直角，是矩形；图二是圆。")],
    [([0], "图一的A点附近有小方角标记，表示直角。")],
    [("0.33", r"\(\frac{1}{3}=0.333\ldots\)，保留两位小数得到0.33。")],
    [
        ([2], r"第二组共有\(5+3=8\)人。"),
        ("14", r"女生总人数为\(3+3+3+5=14\)。"),
        (
            "第一组男生和女生人数相等。",
            "开放题，可写其他由图表支持的结论，例如第四组女生最多。",
        ),
    ],
]


def attach(questions):
    for n, (q, specs) in enumerate(zip(questions, SPECS), 1):
        ts = targets(q)
        assert len(ts) == len(specs), (n, ts)
        entries = []
        for i, (t, (value, explain)) in enumerate(zip(ts, specs), 1):
            e = {k: t[k] for k in ("target", "targetId", "type") if k in t}

            def text(s, suffix):
                return dict(id=f"a{n}_{i}_{suffix}", type="text", version=1, text=s)

            if t["type"] == "choice":
                e["optionIds"] = [t["options"][j]["id"] for j in value]
            elif t["type"] == "fill":
                e.update(text=value, alternatives=[])
            else:
                e["blocks"] = [text(value, "solution")]
            e["explanation"] = [text(explain, "explain")]
            entries.append(e)
        q["answer"] = {"schemaVersion": 1, "entries": entries}
    # Reuse the question's SVG asset in the explanation, without duplicating bytes.
    questions[12]["answer"]["entries"][0]["explanation"].append(
        dict(
            id="a13_image",
            type="image",
            version=1,
            assetId="asset_svg",
            alt="正确选项中的矩形",
            display={"align": "left", "widthPercent": 40},
        )
    )
    # Demonstrate a geometric figure in a solution, in its own Block ID namespace.
    g = copy.deepcopy(questions[11]["blocks"][1])
    g["id"] = "a12_geometry"
    g["display"]["widthPercent"] = 40
    questions[11]["answer"]["entries"][1]["explanation"].append(g)
    return questions
