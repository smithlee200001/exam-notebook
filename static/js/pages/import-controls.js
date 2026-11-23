import { $ } from "../dom.js";
import { state } from "../model/state.js";
function syncImageSelection() {
  const preview = $("source-image");
  if (state.pendingImage) preview.src = state.pendingImage.url;
  else preview.removeAttribute("src");
  preview.hidden = !state.pendingImage;
  $("source-empty").hidden = !!state.pendingImage;
  $("pending-image").textContent = state.pendingImage
    ? "待识别图片：" + state.pendingImage.file.name
    : "未选择待识别图片";
  $("extract").disabled = state.busy || !state.pendingImage;
}
function clearImageSelection() {
  const previous = state.pendingImage;
  state.pendingImage = null;
  $("file").value = "";
  state.generation++;
  syncImageSelection();
  if (previous) URL.revokeObjectURL(previous.url);
}
function setImportBusy(value) {
  state.busy = value;
  for (const id of ["file", "manual", "demo", "source"]) $(id).disabled = value;
  $("extract").disabled = value || !state.pendingImage;
  $("editor").inert = value;
  $("draft-nav").inert = value;
}
function crop(box) {
  const im = $("source-image");
  if (!state.pendingImage || !im.complete || !im.naturalWidth)
    throw Error("请先选择对应原图");
  const [l, t, r, bt] = box;
  if (
    box.length !== 4 ||
    !box.every(Number.isFinite) ||
    !(0 <= l && l < r && r <= 1000 && 0 <= t && t < bt && bt <= 1000)
  )
    throw Error("裁剪坐标无效");
  const x = Math.floor((l * im.naturalWidth) / 1000),
    y = Math.floor((t * im.naturalHeight) / 1000),
    w = Math.ceil((r * im.naturalWidth) / 1000) - x,
    h = Math.ceil((bt * im.naturalHeight) / 1000) - y;
  if (w < 5 || h < 5) throw Error("图表区域太小");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(im, x, y, w, h, 0, 0, w, h);
  return {
    mimeType: "image/png",
    content: canvas.toDataURL("image/png").split(",")[1],
  };
}

export { syncImageSelection, clearImageSelection, setImportBusy, crop };
