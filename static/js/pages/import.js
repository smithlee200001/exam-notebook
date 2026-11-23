import { $, message, run } from "../dom.js";
import { api } from "../api.js";
import { blank } from "../model/blocks.js";
import {
  syncImageSelection,
  clearImageSelection,
  setImportBusy,
} from "./import-controls.js";
import { renderDraft } from "../editors/question.js";
import { loadExamples } from "../model/examples.js";
import { state } from "../model/state.js";
export function initImport() {
  $("file").onchange = run(async () => {
    if (state.busy) return;
    const file = $("file").files[0];
    // 新选择不能继承上一张图的上传权，即使新图验证失败或更换被取消。
    clearImageSelection();
    if (!file) {
      message("未选择待识别图片，已有草稿保留。");
      return;
    }
    setImportBusy(true);
    let url;
    try {
      if (file.size > 4 * 1024 * 1024) throw Error("图片不能超过 4 MB");
      if (
        file.type &&
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw Error("请选择 PNG、JPEG 或 WebP 图片");
      url = URL.createObjectURL(file);
      const probe = new Image();
      probe.src = url;
      try {
        await probe.decode();
      } catch {
        throw Error("无法读取图片");
      }
      if (!probe.naturalWidth || !probe.naturalHeight)
        throw Error("无法读取图片");
      if (probe.naturalWidth * probe.naturalHeight > 8000000)
        throw Error("图片不能超过 800 万像素");
      if (
        state.drafts.some((q) => !q.saved) &&
        !confirm("更换图片会清除尚未保存的题目草稿，继续吗？")
      ) {
        message("已取消更换，已有草稿保留。请重新选择要识别的图片。");
        return;
      }
      state.pendingImage = { file, url };
      $("source").value = file.name;
      syncImageSelection();
      state.drafts = [];
      state.current = 0;
      renderDraft();
      message("图片已就绪，点击识别开始拆题。");
    } catch (e) {
      message(e.message + "。已有草稿保留，请重新选择要识别的图片。");
    } finally {
      if (url && state.pendingImage?.url !== url) URL.revokeObjectURL(url);
      setImportBusy(false);
    }
  });
  $("extract").onclick = run(async () => {
    if (!state.pendingImage || state.busy) return;
    if (
      state.drafts.some((q) => !q.saved) &&
      !confirm("重新识别会替换未保存草稿，继续吗？")
    )
      return;
    const file = state.pendingImage.file,
      ticket = ++state.generation;
    setImportBusy(true);
    message("Codex 正在识别整张图片并拆题，请稍候…");
    try {
      const result = await api("/api/bank/extract", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      if (ticket !== state.generation) return;
      state.drafts = result.questions;
      state.current = 0;
      renderDraft();
      message(`识别出 ${state.drafts.length} 道题，请逐题校对后入库。`);
    } finally {
      setImportBusy(false);
    }
  });
  $("manual").onclick = () => {
    if (state.busy) return;
    state.drafts.push(blank());
    state.current = state.drafts.length - 1;
    renderDraft();
  };
  $("demo").onclick = run(async () => {
    if (state.busy) return;
    if (
      state.drafts.some((q) => !q.saved) &&
      !confirm("演示会替换尚未保存的草稿，继续吗？")
    )
      return;
    setImportBusy(true);
    try {
      const examples = await loadExamples();
      clearImageSelection();
      state.drafts = examples;
      state.current = 0;
      $("source").value = "题型排版示例 · 非真实识别";
      renderDraft();
      message(
        "已加载 16 道新格式示例：多空、图文选项、小问、表格、统计图、几何图和图标。更新预览并校对后可保存组卷，不调用 Codex。",
      );
    } finally {
      setImportBusy(false);
    }
  });
}
