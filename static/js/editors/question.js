import { $, message, node, button, field, run } from "../dom.js";
import { post } from "../api.js";
import {
  uid,
  template,
  rawDrafts,
  reviewPayload,
  questionPayload,
  applyRaw,
} from "../model/blocks.js";
import { setImportBusy, crop } from "../pages/import-controls.js";
import { renderQuestion } from "../render/question.js";
import { loadBank } from "../pages/bank.js";
import { state } from "../model/state.js";
import * as Blocks from "../render/blocks.js";
import * as Answers from "../answers.js";
const types = ["选择题", "填空题", "计算题", "解答题", "其他"];
function renderDraft() {
  $("live-preview").replaceChildren();
  $("source-empty").hidden = !!state.pendingImage || state.drafts.length > 0;
  $("draft-count").textContent = state.drafts.length;
  $("draft-nav").replaceChildren();
  $("editor").replaceChildren();
  state.drafts.forEach((q, i) => {
    const b = button(
      q.saved ? `✓ ${q.saved}` : `${i + 1} · ${q.tags[0] || "新题"}`,
      () => {
        state.current = i;
        renderDraft();
      },
    );
    b.classList.toggle("active", i === state.current);
    $("draft-nav").append(b);
  });
  const q = state.drafts[state.current],
    editor = $("editor");
  if (!q) {
    editor.append(node("p", "加载示例、识别图片或手动添加题目开始。"));
    return;
  }
  if (q.saved) {
    editor.append(node("p", "已入库：" + q.saved));
    renderQuestion(q, editor);
    return;
  }
  let validated = "",
    previewTicket = 0;
  const check = node("input");
  check.type = "checkbox";
  check.id = "draft-reviewed";
  check.disabled = true;
  const preview = node("div", undefined, "preview-box");
  const invalidate = () => {
    previewTicket++;
    validated = "";
    check.checked = false;
    check.disabled = true;
  };
  const draw = () => {
    preview.replaceChildren(node("h3", "题面预览"));
    try {
      renderQuestion(q, preview);
      if (q.answer) {
        const details = node("details");
        details.append(node("summary", "查看答案与解析"));
        Answers.render(q, q.answer, details, q.assets || {});
        preview.append(details);
      }
      return true;
    } catch (e) {
      preview.append(node("p", e.message, "warning"));
      return false;
    }
  };
  const updatePreview = async () => {
    invalidate();
    const ticket = ++previewTicket;
    try {
      if (answerInvalid) throw Error("请修正答案 JSON");
      applyRaw(q.blocks);
      if (!draw()) throw Error("内容无法渲染，请修正结构后更新预览");
      const payload = reviewPayload(q),
        snapshot = JSON.stringify(payload);
      await post("/api/bank/validate", payload);
      if (
        ticket !== previewTicket ||
        snapshot !== JSON.stringify(reviewPayload(q))
      )
        return;
      validated = snapshot;
      check.disabled = false;
      message("预览已通过数据校验，请核对后保存。");
    } catch (e) {
      message(e.message);
      preview.append(node("p", e.message, "warning"));
    }
  };
  const edit = (parent, label, value, change, multi = false) =>
    field(
      parent,
      label,
      value,
      (v) => {
        change(v);
        invalidate();
      },
      multi,
    );
  const selectField = (parent, label, value, choices, change) => {
    const l = node("label", label),
      s = node("select");
    for (const [v, t] of choices) {
      const o = node("option", t);
      o.value = v;
      s.append(o);
    }
    s.value = value;
    s.onchange = () => {
      change(s.value);
      invalidate();
      draw();
    };
    l.append(s);
    parent.append(l);
    return s;
  };
  if (q.warnings.length)
    editor.append(node("p", q.warnings.join("；"), "warning"));
  edit(editor, "原卷题号", q.sourceNumber, (v) => (q.sourceNumber = v));
  edit(editor, "学科", q.subject, (v) => (q.subject = v));
  selectField(
    editor,
    "题型",
    q.kind,
    types.map((t) => [t, t]),
    (v) => (q.kind = v),
  );
  edit(
    editor,
    "知识点（逗号分隔）",
    q.tags.join("，"),
    (v) =>
      (q.tags = v
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)),
  );
  function addTools(parent, blocks, allowed) {
    const bar = node("div", undefined, "toolbar add-blocks"),
      select = node("select");
    select.setAttribute("aria-label", "添加内容类型");
    for (const t of allowed) {
      const o = node("option", Blocks.names[t]);
      o.value = t;
      select.append(o);
    }
    select.value = allowed[0];
    bar.append(
      select,
      button("＋添加", () => {
        const added = template(select.value);
        if (select.value === "row" && blocks[0]?.children)
          added.children = blocks[0].children.map(() => template("cell"));
        blocks.push(added);
        invalidate();
        renderDraft();
      }),
    );
    parent.append(bar);
  }
  const common = [
    "text",
    "blank",
    "image",
    "geometry",
    "chart",
    "table",
    "icon",
  ];
  function editBlocks(blocks, parent, owner) {
    blocks.forEach((b, i) => {
      const box = node("details", undefined, "block-editor");
      box.open =
        owner === "question" &&
        ["text", "blank", "geometry", "chart", "image"].includes(b.type);
      const title = node(
        "summary",
        `${Blocks.names[b.type] || b.type} · ${i + 1}`,
      );
      box.append(title);
      const tools = node("div", undefined, "block-tools");
      tools.append(
        button("↑", () => {
          if (i) {
            [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
            renderDraft();
          }
        }),
        button("↓", () => {
          if (i < blocks.length - 1) {
            [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
            renderDraft();
          }
        }),
        button("移除", () => {
          blocks.splice(i, 1);
          renderDraft();
        }),
      );
      box.append(tools);
      if (Object.hasOwn(b, "text")) {
        edit(
          box,
          "内容（支持 LaTeX，换行直接按回车）",
          b.text,
          (v) => (b.text = v),
          true,
        );
        if (["option", "subquestion", "cell"].includes(b.type))
          box.append(
            button("转换为组合内容", () => {
              const t = b.text;
              delete b.text;
              b.children = [{ ...template("text"), text: t }];
              renderDraft();
            }),
          );
      }
      if (b.type === "text" || b.type === "cell")
        selectField(
          box,
          "内容对齐",
          b.display?.align || "",
          [
            ["", "默认"],
            ["left", "左对齐"],
            ["center", "居中"],
          ],
          (v) => {
            b.display = { ...b.display };
            if (v) b.display.align = v;
            else delete b.display.align;
          },
        );
      if (b.type === "blank")
        edit(box, "空格宽度（em）", b.display?.widthEm ?? 5, (v) => {
          b.display = { widthEm: Number(v) };
          draw();
        }).type = "number";
      if (b.type === "icon") {
        selectField(
          box,
          "图标",
          b.name,
          [
            ["info", "提示"],
            ["warning", "注意"],
            ["check", "完成"],
          ],
          (v) => (b.name = v),
        );
        edit(box, "文字描述", b.alt, (v) => (b.alt = v));
        edit(
          box,
          "尺寸（em）",
          b.display?.sizeEm ?? 1,
          (v) => (b.display = { sizeEm: Number(v) }),
        ).type = "number";
      }
      if (b.type === "options") {
        selectField(
          box,
          "选择模式",
          b.mode,
          [
            ["single", "单选"],
            ["multiple", "多选"],
          ],
          (v) => (b.mode = v),
        );
        selectField(
          box,
          "每行选项数",
          String(b.display?.columns ?? 1),
          [
            ["1", "1"],
            ["2", "2"],
            ["4", "4"],
          ],
          (v) => (b.display = { columns: Number(v) }),
        );
      }
      if (b.type === "row")
        selectField(
          box,
          "行类型",
          b.role || "",
          [
            ["", "普通行"],
            ["header", "表头"],
          ],
          (v) => {
            if (v) b.role = v;
            else delete b.role;
          },
        );
      if (["image", "geometry", "chart", "table"].includes(b.type)) {
        b.display ??= {};
        selectField(
          box,
          "位置",
          b.display.align || "center",
          [
            ["left", "左对齐"],
            ["center", "居中"],
          ],
          (v) => (b.display.align = v),
        );
        const label = node("label", "显示宽度", "geometry-size"),
          slider = node("input"),
          output = node("output");
        slider.type = "range";
        slider.min = 20;
        slider.max = 100;
        slider.step = 1;
        slider.value =
          b.display.widthPercent ?? (b.type === "table" ? 100 : 60);
        output.textContent = slider.value + "%";
        slider.setAttribute("aria-label", "显示宽度百分比");
        slider.oninput = () => {
          b.display.widthPercent = Number(slider.value);
          output.textContent = slider.value + "%";
          invalidate();
          draw();
        };
        label.append(slider, output);
        box.append(label);
      }
      if (b.type === "image") {
        edit(box, "图片描述", b.alt, (v) => (b.alt = v));
        const upload = node("input");
        upload.type = "file";
        upload.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
        upload.setAttribute("aria-label", "上传图片");
        upload.onchange = run(async () => {
          const file = upload.files[0];
          if (!file) return;
          invalidate();
          if (file.size > 4 * 1024 * 1024) throw Error("图片不能超过 4 MB");
          setImportBusy(true);
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            let binary = "";
            for (const byte of bytes) binary += String.fromCharCode(byte);
            const asset = await post("/api/bank/assets/validate", {
              mimeType: file.type,
              content: btoa(binary),
            });
            q.assets ??= {};
            q.assets[b.assetId] = asset;
            invalidate();
            draw();
          } finally {
            setImportBusy(false);
          }
        });
        box.append(upload);
        // Crop coordinates are editing state, never part of a persisted image block.
        let cropBox = [0, 0, 1000, 1000];
        edit(
          box,
          "从原图裁剪：左、上、右、下（0～1000）",
          cropBox.join(", "),
          (v) => (cropBox = v.split(/[,，]/).map(Number)),
        );
        box.append(
          button(
            "根据坐标重新裁剪",
            run(() => {
              const asset = crop(cropBox);
              q.assets ??= {};
              q.assets[b.assetId] = asset;
              invalidate();
              draw();
            }),
          ),
        );
      }
      if (b.type === "geometry" || b.type === "chart") {
        const details = node("details");
        details.append(
          node(
            "summary",
            b.type === "geometry" ? "编辑点线与条件 JSON" : "编辑图表数据 JSON",
          ),
        );
        const input = edit(
          details,
          "结构数据",
          rawDrafts.get(b) ?? JSON.stringify(b, null, 2),
          (v) => rawDrafts.set(b, v),
          true,
        );
        input.className = "geometry-editor";
        input.spellcheck = false;
        box.append(details);
        // Regenerate the raw editor after changing display to avoid stale JSON overriding sliders.
        for (const child of box.children) {
          if (child.tagName === "LABEL")
            for (const control of child.children) {
              if (control.tagName === "SELECT" || control.type === "range") {
                const event =
                    control.tagName === "SELECT" ? "onchange" : "oninput",
                  fn = control[event];
                control[event] = () => {
                  fn();
                  if (!rawDrafts.has(b))
                    input.value = JSON.stringify(b, null, 2);
                  else {
                    try {
                      const raw = JSON.parse(rawDrafts.get(b));
                      raw.display = b.display;
                      rawDrafts.set(b, JSON.stringify(raw, null, 2));
                      input.value = rawDrafts.get(b);
                    } catch {
                      message("请先修正结构 JSON");
                    }
                  }
                };
              }
            }
        }
      }
      if (b.children) {
        editBlocks(b.children, box, b.type);
        let allowed =
          b.type === "options"
            ? ["option"]
            : b.type === "subquestions"
              ? ["subquestion"]
              : b.type === "table"
                ? ["row"]
                : b.type === "row"
                  ? ["cell"]
                  : b.type === "subquestion"
                    ? [...common, "options"]
                    : b.type === "cell"
                      ? ["text", "blank", "image", "icon"]
                      : common;
        addTools(box, b.children, allowed);
        if (
          ["option", "subquestion", "cell"].includes(b.type) &&
          b.children.length === 1 &&
          b.children[0].type === "text"
        )
          box.append(
            button("简化为文字", () => {
              b.text = b.children[0].text;
              delete b.children;
              renderDraft();
            }),
          );
      }
      parent.append(box);
    });
  }
  editBlocks(q.blocks, editor, "question");
  addTools(editor, q.blocks, [...common, "options", "subquestions"]);
  const answerSection = node("details", undefined, "answer-editor");
  answerSection.append(node("summary", "编辑答案与解析"));
  const answerFields = node("div");
  let answerInvalid = false;
  answerSection.append(answerFields);
  Answers.editor(
    q,
    q.answer,
    answerFields,
    (a, invalid = false) => {
      answerInvalid = invalid;
      if (!invalid) q.answer = a;
      invalidate();
      draw();
    },
    q.assets || {},
    async (file) => {
      if (file.size > 4 * 1024 * 1024) throw Error("图片不能超过4 MB");
      invalidate();
      setImportBusy(true);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const asset = await post("/api/bank/assets/validate", {
          mimeType: file.type,
          content: btoa(binary),
        });
        const id = "asset_" + uid();
        q.assets ??= {};
        q.assets[id] = asset;
        return id;
      } finally {
        setImportBusy(false);
      }
    },
  );
  editor.append(answerSection);
  $("live-preview").append(preview);
  editor.append(button("更新题面预览", run(updatePreview)));
  const checkLabel = node("label", undefined, "check");
  checkLabel.append(
    check,
    document.createTextNode("已校对题面、分类、公式和图片，确认保存"),
  );
  editor.append(checkLabel);
  const save = button(
    "保存这一题到题库",
    run(async () => {
      if (state.busy || q.saved) return;
      if (
        !check.checked ||
        check.disabled ||
        validated !== JSON.stringify(reviewPayload(q))
      )
        throw Error("请先更新预览、完成校对并勾选确认");
      setImportBusy(true);
      save.disabled = true;
      try {
        const data = await post("/api/bank/questions", {
          question: questionPayload(q),
          answer: q.answer ?? null,
          assets: q.assets || {},
          source: $("source").value,
          reviewed: true,
        });
        q.saved = data.number;
        renderDraft();
        message("已保存 " + data.number);
        await loadBank();
      } finally {
        setImportBusy(false);
        save.disabled = false;
      }
    }),
  );
  save.className = "primary";
  editor.append(
    save,
    button("移除这个草稿", () => {
      state.drafts.splice(state.current, 1);
      state.current = Math.max(0, state.current - 1);
      renderDraft();
    }),
  );
  draw();
}

export { renderDraft };
