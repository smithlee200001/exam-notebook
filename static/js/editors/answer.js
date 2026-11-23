import { node as el } from "../dom.js";
import { key, targets } from "../model/answer-targets.js";
import * as Blocks from "../render/blocks.js";
function editor(q, initial, parent, onChange, assets = {}, upload) {
  let entries = JSON.parse(JSON.stringify(initial?.entries || []));
  const errors = new Set(),
    jsonInputs = [];
  const emit = () => {
    for (const item of jsonInputs)
      if (!errors.has(item.input))
        item.input.value = JSON.stringify(item.read() || [], null, 2);
    onChange(
      entries.length
        ? { schemaVersion: 1, entries: JSON.parse(JSON.stringify(entries)) }
        : null,
      errors.size > 0,
    );
  };
  const ts = targets(q);
  parent.append(
    el(
      "p",
      "可只录入部分答案。填空的其他表达仅供人工参考，不自动判分。",
      "hint",
    ),
  );
  for (const t of ts) {
    let entry = entries.find((e) => key(e) === key(t));
    const box = el("details", undefined, "answer-editor-item");
    box.open = true;
    box.append(el("summary", t.label));
    const ensure = () => {
      if (!entry) {
        entry = {
          target: t.target,
          type: t.type,
          ...(t.targetId ? { targetId: t.targetId } : {}),
        };
        if (t.type === "choice") entry.optionIds = [];
        else if (t.type === "fill") {
          entry.text = "";
          entry.alternatives = [];
        } else entry.blocks = [];
        entries.push(entry);
      }
      return entry;
    };
    const field = (label, value, change) => {
      const l = el("label", label),
        input = el("textarea");
      input.value = value;
      input.oninput = () => {
        change(input.value);
        emit();
      };
      l.append(input);
      box.append(l);
      return input;
    };
    if (t.type === "choice") {
      t.options.forEach((o, i) => {
        const l = el("label", undefined, "check"),
          c = el("input");
        c.type = "checkbox";
        c.checked = entry?.optionIds.includes(o.id) || false;
        c.setAttribute(
          "aria-label",
          t.label + "正确选项" + String.fromCharCode(65 + i),
        );
        c.onchange = () => {
          const e = ensure();
          e.optionIds = c.checked
            ? t.mode === "single"
              ? [o.id]
              : [...e.optionIds.filter((x) => x !== o.id), o.id]
            : e.optionIds.filter((x) => x !== o.id);
          if (t.mode === "single")
            for (const other of box.querySelectorAll("input[type=checkbox]"))
              if (other !== c) other.checked = false;
          emit();
        };
        l.append(c, el("span", String.fromCharCode(65 + i) + ". "));
        const content = el("div", undefined, "question-body");
        if (Object.hasOwn(o, "text")) Blocks.rich(content, o.text);
        else Blocks.flow(o.children, content, assets);
        l.append(content);
        box.append(l);
      });
    } else if (t.type === "fill") {
      field(
        "标准答案（支持 LaTeX）",
        entry?.text || "",
        (v) => (ensure().text = v),
      );
      field(
        "其他可接受表达（每行一项，可留空）",
        (entry?.alternatives || []).join("\n"),
        (v) => (ensure().alternatives = v.split("\n").filter((s) => s.trim())),
      );
    } else {
      const simple =
        !entry?.blocks?.length ||
        (entry.blocks.length === 1 && entry.blocks[0].type === "text");
      if (simple)
        field(
          "标准解答（支持 LaTeX）",
          entry?.blocks?.[0]?.text || "",
          (v) =>
            (ensure().blocks = [
              {
                id: "solution_" + (t.targetId || "whole"),
                type: "text",
                version: 1,
                text: v,
              },
            ]),
        );
    }
    // Advanced blocks permit diagrams/tables without inventing a second answer renderer.
    const jsonField = (label, name) => {
      const details = el("details");
      details.append(el("summary", label));
      const input = el("textarea");
      input.className = "geometry-editor";
      input.value = JSON.stringify(entry?.[name] || [], null, 2);
      const error = el("p", undefined, "warning");
      error.hidden = true;
      jsonInputs.push({ input, read: () => entry?.[name] });
      input.oninput = () => {
        try {
          const v = JSON.parse(input.value);
          if (!Array.isArray(v)) throw Error("需要 Block 数组");
          ensure()[name] = v;
          errors.delete(input);
          error.hidden = true;
          emit();
        } catch (e) {
          error.textContent = e.message;
          error.hidden = false;
          errors.add(input);
          emit();
        }
      };
      details.append(input, error);
      box.append(details);
    };
    if (t.type === "solution")
      jsonField("高级：编辑完整解答 Block JSON", "blocks");
    const simpleExplanation =
      !entry?.explanation?.length ||
      (entry.explanation.length === 1 && entry.explanation[0].type === "text");
    if (simpleExplanation)
      field(
        "解析（可留空，支持 LaTeX）",
        entry?.explanation?.[0]?.text || "",
        (v) =>
          (ensure().explanation = v.trim()
            ? [
                {
                  id: "explanation_" + (t.targetId || "whole"),
                  type: "text",
                  version: 1,
                  text: v,
                },
              ]
            : []),
      );
    jsonField("高级：编辑完整解析 Block JSON", "explanation");
    if (upload) {
      const input = el("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
      const l = el("label", "向解析添加图片");
      l.append(input);
      box.append(l);
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        input.disabled = true;
        try {
          const aid = await upload(file);
          const e = ensure();
          e.explanation ??= [];
          e.explanation.push({
            id: "answer_image_" + Date.now(),
            type: "image",
            version: 1,
            assetId: aid,
            alt: file.name,
            display: { align: "center", widthPercent: 60 },
          });
          emit();
        } catch (e) {
          const p = el("p", e.message, "warning");
          box.append(p);
        } finally {
          input.disabled = false;
        }
      };
    }
    const clear = el("button", "清空此项");
    clear.type = "button";
    clear.onclick = () => {
      entries = entries.filter((e) => key(e) !== key(t));
      entry = null;
      for (const input of box.querySelectorAll("textarea,input")) {
        errors.delete(input);
        if (input.type === "checkbox") input.checked = false;
        else if (input.type !== "file") input.value = "";
      }
      emit();
    };
    box.append(clear);
    parent.append(box);
  }
  const stale = entries.filter((e) => !ts.some((t) => key(t) === key(e)));
  if (stale.length) {
    const remove = el("button", "移除失效目标的答案");
    remove.type = "button";
    remove.onclick = () => {
      entries = entries.filter((e) => ts.some((t) => key(t) === key(e)));
      emit();
      parent.replaceChildren();
      editor(
        q,
        entries.length ? { schemaVersion: 1, entries } : null,
        parent,
        onChange,
        assets,
        upload,
      );
    };
    parent.append(el("p", "题面目标已变化，存在失效答案。", "warning"), remove);
  }
}

export { editor };
