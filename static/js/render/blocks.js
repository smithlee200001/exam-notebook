import * as Geometry from "./geometry.js";
import { node as el } from "../dom.js";
import { rich } from "./math.js";
import { size } from "./size.js";
import { chart } from "./chart.js";

const inlineTypes = new Set(["text", "blank", "icon"]);
const names = {
  text: "文字与公式",
  blank: "作答空",
  options: "选项组",
  option: "选项",
  subquestions: "小问组",
  subquestion: "小问",
  image: "图片",
  table: "表格",
  row: "行",
  cell: "单元格",
  chart: "统计图表",
  geometry: "几何图",
  icon: "图标",
};
function flow(blocks, parent, assets) {
  let line = null;
  for (const b of blocks) {
    if (inlineTypes.has(b.type)) {
      if (!line) {
        line = el("div", undefined, "block-flow");
        parent.append(line);
      }
      if (b.type === "text" && b.display?.align)
        line.style.textAlign = b.display.align;
      render(b, line, assets);
    } else {
      line = null;
      render(b, parent, assets);
    }
  }
}
function content(b, parent, assets) {
  if (Object.hasOwn(b, "text")) rich(parent, b.text, b.display?.align);
  else flow(b.children, parent, assets);
}
function render(b, parent, assets = {}) {
  let n;
  switch (b.type) {
    case "text":
      rich(parent, b.text, b.display?.align);
      return;
    case "blank":
      n = el("span", undefined, "answer-blank");
      n.style.width = (b.display?.widthEm ?? 5) + "em";
      n.setAttribute("aria-label", "作答空");
      n.setAttribute("data-blank-id", b.id);
      break;
    case "icon":
      n = el(
        "span",
        { info: "ⓘ", warning: "⚠", check: "✓" }[b.name],
        "content-icon",
      );
      n.style.fontSize = (b.display?.sizeEm ?? 1) + "em";
      n.setAttribute("role", "img");
      n.setAttribute("aria-label", b.alt);
      if (!b.alt) n.setAttribute("aria-hidden", "true");
      break;
    case "image":
      n = el("img");
      n.alt = b.alt;
      {
        const a = assets[b.assetId];
        n.src = a
          ? `data:${a.mimeType};base64,${a.content}`
          : "/api/bank/assets/" + encodeURIComponent(b.assetId);
      }
      size(n, b);
      break;
    case "geometry":
      n = Geometry.render(b);
      break;
    case "chart":
      n = chart(b);
      break;
    case "options":
      n = el("div", undefined, "block-options");
      n.style.setProperty("--option-columns", b.display?.columns ?? 1);
      b.children.forEach((item, i) => {
        const row = el("div", undefined, "block-option");
        row.append(
          el("span", String.fromCharCode(65 + i) + ".", "item-number"),
        );
        const body = el("div", undefined, "item-content");
        content(item, body, assets);
        row.append(body);
        n.append(row);
      });
      break;
    case "subquestions":
      n = el("div", undefined, "block-subquestions");
      b.children.forEach((item, i) => {
        const row = el("div", undefined, "block-subquestion");
        row.append(el("span", `（${i + 1}）`, "item-number"));
        const body = el("div", undefined, "item-content");
        content(item, body, assets);
        row.append(body);
        n.append(row);
      });
      break;
    case "table":
      n = el("table", undefined, "content-table");
      size(n, b, 100);
      for (const row of b.children) {
        const tr = el("tr");
        for (const cell of row.children) {
          const td = el(row.role === "header" ? "th" : "td");
          if (cell.display?.align) td.style.textAlign = cell.display.align;
          content(cell, td, assets);
          tr.append(td);
        }
        n.append(tr);
      }
      break;
    default:
      throw Error("不支持的内容类型：" + b.type);
  }
  n.setAttribute("data-block-id", b.id);
  parent.append(n);
}

export { flow, render, rich, names, chart };
