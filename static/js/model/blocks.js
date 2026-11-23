import { templates } from "./templates.js";
let nextId = 0;
function uid() {
  return "b_" + Date.now().toString(36) + "_" + ++nextId;
}
function template(type) {
  const base = { id: uid(), type, version: 1 };
  if (type === "text") return { ...base, text: "请输入题目内容" };
  if (type === "blank") return { ...base, display: { widthEm: 5 } };
  if (type === "icon")
    return { ...base, name: "info", alt: "提示", display: { sizeEm: 1 } };
  if (type === "image")
    return {
      ...base,
      assetId: "asset_" + uid(),
      alt: "图片",
      display: { align: "center", widthPercent: 60 },
    };
  if (type === "option" || type === "subquestion" || type === "cell")
    return { ...base, text: type === "cell" ? "" : "请输入内容" };
  if (type === "options")
    return {
      ...base,
      mode: "single",
      display: { columns: 2 },
      children: [template("option"), template("option")],
    };
  if (type === "subquestions")
    return { ...base, children: [template("subquestion")] };
  if (type === "row")
    return { ...base, children: [template("cell"), template("cell")] };
  if (type === "table")
    return {
      ...base,
      display: { align: "center", widthPercent: 100 },
      children: [{ ...template("row"), role: "header" }, template("row")],
    };
  const source = templates[type];
  if (!source) throw Error("没有此类型模板");
  return { ...JSON.parse(JSON.stringify(source)), id: base.id };
}
function blank() {
  return {
    schemaVersion: 2,
    sourceNumber: "",
    subject: "数学",
    kind: "计算题",
    tags: [],
    warnings: [],
    blocks: [template("text")],
  };
}
const rawDrafts = new WeakMap();
function reviewPayload(q) {
  return { question: questionPayload(q), answer: q.answer ?? null };
}
function questionPayload(q) {
  return Object.fromEntries(
    [
      "schemaVersion",
      "sourceNumber",
      "subject",
      "kind",
      "tags",
      "warnings",
      "blocks",
    ].map((k) => [k, q[k]]),
  );
}
function applyRaw(blocks) {
  for (const b of blocks) {
    if (rawDrafts.has(b)) {
      const next = JSON.parse(rawDrafts.get(b));
      for (const k of Object.keys(b)) delete b[k];
      Object.assign(b, next);
      rawDrafts.delete(b);
    }
    if (b.children) applyRaw(b.children);
  }
}

export {
  uid,
  template,
  blank,
  rawDrafts,
  reviewPayload,
  questionPayload,
  applyRaw,
};
