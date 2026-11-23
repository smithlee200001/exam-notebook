import { $, node, button, run } from "../dom.js";
import { api } from "../api.js";
import { renderQuestion } from "../render/question.js";
import { emit } from "../events.js";
import { openAnswerEditor } from "../editors/saved-answer.js";
import { state } from "../model/state.js";
async function loadBank() {
  state.questions = await api("/api/bank/questions");
  renderBank();
}
function renderBank() {
  $("bank-count").textContent = state.questions.length;
  $("bank-cards").replaceChildren();
  const term = $("search").value.trim().toLowerCase(),
    kind = $("kind-filter").value,
    subject = $("subject-filter").value.trim();
  const filtered = state.questions.filter(
    (q) =>
      (!kind || q.kind === kind) &&
      (!subject || q.subject.includes(subject)) &&
      JSON.stringify([q.number, q.source, q.subject, q.tags, q.blocks])
        .toLowerCase()
        .includes(term),
  );
  if (!filtered.length)
    $("bank-cards").append(node("p", "暂无匹配题目。先在图片拆题页校对入库。"));
  filtered.forEach((q) => {
    const card = node("article", undefined, "card");
    card.append(
      node("h3", `${q.number} · ${q.subject} · ${q.kind}`),
      node("p", `${q.tags.join(" / ")}　来源：${q.source} ${q.sourceNumber}`),
    );
    renderQuestion(q, card);
    const picked = state.selection.some((s) => s.id === q.id);
    card.append(
      button(
        "查看 / 编辑答案",
        run(() => openAnswerEditor(q, card)),
      ),
    );
    card.append(
      button(picked ? "✓ 已选，点击移除" : "＋ 加入练习卷", () => {
        if (picked)
          state.selection = state.selection.filter((s) => s.id !== q.id);
        else
          state.selection.push({
            id: q.id,
            lines: q.kind === "选择题" ? 0 : 4,
          });
        renderBank();
        emit("selection-changed");
      }),
    );
    $("bank-cards").append(card);
  });
  $("selected-count").textContent = state.selection.length;
}

export { loadBank, renderBank };
