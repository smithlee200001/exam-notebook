import { message, node, button, run } from "../dom.js";
import { api, post } from "../api.js";
import { uid } from "../model/blocks.js";
import * as Answers from "../answers.js";
async function openAnswerEditor(q, card) {
  let host = card.querySelector(".bank-answer-panel");
  if (host) {
    host.remove();
    return;
  }
  host = node("section", undefined, "bank-answer-panel");
  card.append(host);
  try {
    const result = await api("/api/bank/questions/" + q.id + "/answer");
    let answer = result.answer,
      invalid = false,
      uploading = false,
      working = false;
    const assets = {};
    host.append(node("h3", "答案与解析"));
    const fields = node("div"),
      preview = node("div");
    const redraw = () => {
      preview.replaceChildren();
      Answers.render(q, answer, preview, assets);
    };
    Answers.editor(
      q,
      answer,
      fields,
      (a, bad = false) => {
        invalid = bad;
        if (!bad) answer = a;
        redraw();
      },
      assets,
      async (file) => {
        if (file.size > 4 * 1024 * 1024) throw Error("图片不能超过4 MB");
        uploading = true;
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          const asset = await post("/api/bank/assets/validate", {
            mimeType: file.type,
            content: btoa(binary),
          });
          const id = "asset_" + uid();
          assets[id] = asset;
          return id;
        } finally {
          uploading = false;
        }
      },
    );
    host.append(
      fields,
      button(
        "保存答案",
        run(async () => {
          if (invalid) throw Error("请修正答案 JSON");
          if (uploading || working) throw Error("请等待当前操作完成");
          if (!answer)
            throw Error(
              "没有答案，请至少录入一项；要清空已保存答案请使用下方按钮",
            );
          working = true;
          host.inert = true;
          try {
            const saved = await api("/api/bank/questions/" + q.id + "/answer", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ answer, assets }),
            });
            answer = saved.answer;
            redraw();
            message("答案已保存；已有练习卷快照保持不变。");
          } finally {
            working = false;
            host.inert = false;
          }
        }),
      ),
      button(
        "清空已保存答案",
        run(async () => {
          if (working || uploading) return;
          if (!confirm("清空此题已保存的答案？已有练习卷答案快照保留。"))
            return;
          await api("/api/bank/questions/" + q.id + "/answer", {
            method: "DELETE",
          });
          host.remove();
          message("已清空此题答案。");
        }),
      ),
      preview,
    );
    redraw();
  } catch (e) {
    host.append(node("p", e.message, "warning"));
  }
}

export { openAnswerEditor };
