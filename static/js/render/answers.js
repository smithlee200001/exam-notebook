import { node as el } from "../dom.js";
import { key, targets } from "../model/answer-targets.js";
import * as Blocks from "../render/blocks.js";
function render(q, answer, parent, assets = {}) {
  const box = el("div", undefined, "answer-content question-body"),
    ts = targets(q),
    entries = answer?.entries || [];
  let missing = 0;
  for (const t of ts) {
    const row = el("section", undefined, "answer-entry");
    row.append(el("strong", t.label));
    const e = entries.find((e) => key(e) === key(t));
    if (!e) {
      missing++;
      row.append(el("p", "未录入答案", "hint"));
    } else {
      if (e.type === "choice") {
        const labels = t.options
          .map((o, i) =>
            e.optionIds.includes(o.id) ? String.fromCharCode(65 + i) : null,
          )
          .filter(Boolean);
        row.append(el("p", "答案：" + labels.join("、")));
      } else if (e.type === "fill") {
        const p = el("div");
        p.append(el("span", "答案："));
        Blocks.rich(p, e.text);
        row.append(p);
        if (e.alternatives?.length) {
          const a = el("div", undefined, "hint");
          a.append(el("span", "其他可接受表达："));
          e.alternatives.forEach((s, i) => {
            if (i) a.append(el("span", "；"));
            Blocks.rich(a, s);
          });
          row.append(a);
        }
      } else Blocks.flow(e.blocks, row, assets);
      if (e.explanation?.length) {
        row.append(el("div", "解析", "answer-explanation-label"));
        Blocks.flow(e.explanation, row, assets);
      }
    }
    box.append(row);
  }
  const stale = entries.filter((e) => !ts.some((t) => key(t) === key(e)));
  if (stale.length)
    box.append(el("p", "存在失效的答案目标，请重新校验。", "warning"));
  box.append(
    el(
      "p",
      !entries.length
        ? "未录入答案"
        : missing
          ? `已录入 ${ts.length - missing}/${ts.length} 项，仍有 ${missing} 项未录入。`
          : "答案已完整录入。",
      "hint",
    ),
  );
  parent.append(box);
}

export { render };
