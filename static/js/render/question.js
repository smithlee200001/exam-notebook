import { node } from "../dom.js";
import * as Blocks from "./blocks.js";
function renderQuestion(q, parent) {
  const body = node("div", undefined, "question-body");
  Blocks.flow(q.blocks, body, q.assets || {});
  parent.append(body);
}

export { renderQuestion };
