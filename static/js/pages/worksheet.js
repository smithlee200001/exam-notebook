import { $, message, node, button, field, run } from "../dom.js";
import { api, post } from "../api.js";
import { renderQuestion } from "../render/question.js";
import { tab } from "./navigation.js";
import { emit } from "../events.js";
import { state } from "../model/state.js";
import * as Answers from "../answers.js";
function renderSelection() {
  $("selection").replaceChildren();
  $("selected-count").textContent = state.selection.length;
  state.selection.forEach((s, i) => {
    const q = state.questions.find((q) => q.id === s.id),
      row = node("div", undefined, "selection-row");
    row.append(node("strong", `${i + 1}. ${q.number} · ${q.kind}`));
    field(
      row,
      "作答留白行数（0～20）",
      s.lines,
      (v) => (s.lines = Number(v)),
    ).type = "number";
    row.append(
      button("↑", () => {
        if (i) {
          [state.selection[i - 1], state.selection[i]] = [
            state.selection[i],
            state.selection[i - 1],
          ];
          renderSelection();
        }
      }),
      button("↓", () => {
        if (i < state.selection.length - 1) {
          [state.selection[i + 1], state.selection[i]] = [
            state.selection[i],
            state.selection[i + 1],
          ];
          renderSelection();
        }
      }),
      button("移除", () => {
        state.selection.splice(i, 1);
        renderSelection();
        emit("selection-changed");
      }),
    );
    $("selection").append(row);
  });
  if (!state.selection.length)
    $("selection").append(node("p", "先从题库选择需要的题目。"));
  $("compose").disabled = !state.selection.length;
}
function renderPaper() {
  if (!state.currentPaper) return;
  const data = state.currentPaper,
    mode = $("paper-mode").value || "question";
  $("paper").replaceChildren();
  if (mode !== "answer") {
    $("paper").append(
      node("h1", data.title),
      node("p", "姓名：____________　日期：____________", "meta"),
    );
    data.items.forEach((item, i) => {
      const section = node("section", undefined, "paper-question");
      section.append(node("h3", `${i + 1}. ${item.question.kind}`));
      renderQuestion(item.question, section);
      const space = node("div", undefined, "answer-space");
      space.style.height = `${item.lines * 32}px`;
      section.append(space);
      $("paper").append(section);
    });
  }
  if (mode !== "question") {
    const answers = node(
      "section",
      undefined,
      mode === "both" ? "paper-answers separate-page" : "paper-answers",
    );
    answers.append(node("h1", data.title + " · 答案与解析"));
    data.items.forEach((item, i) => {
      const section = node("section", undefined, "paper-question");
      section.append(node("h3", `${i + 1}. ${item.question.kind}`));
      Answers.render(item.question, item.answer ?? null, section);
      answers.append(section);
    });
    $("paper").append(answers);
  }
}
async function openPaper(id) {
  state.currentPaper = await api("/api/bank/worksheets/" + id);
  renderPaper();
  $("print").disabled = false;
  tab("compose");
}
async function loadWorksheets() {
  const rows = await api("/api/bank/worksheets");
  $("worksheets").replaceChildren();
  rows.forEach((w) =>
    $("worksheets").append(
      button(
        w.title +
          " · " +
          new Date(w.created_at.replace(" ", "T") + "Z").toLocaleString(
            "zh-CN",
          ),
        run(() => openPaper(w.id)),
      ),
    ),
  );
}

export function initWorksheet() {
  $("paper-mode").onchange = renderPaper;
  $("compose").onclick = run(async () => {
    $("compose").disabled = true;
    try {
      const result = await post("/api/bank/worksheets", {
        title: $("worksheet-title").value,
        items: state.selection,
      });
      await openPaper(result.id);
      await loadWorksheets();
      message("练习卷已保存，可以打印或另存 PDF。");
    } finally {
      $("compose").disabled = !state.selection.length;
    }
  });
  $("print").onclick = () => window.print();
}
export { renderSelection, renderPaper, openPaper, loadWorksheets };
