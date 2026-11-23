import { on } from "./events.js";
import { $, run } from "./dom.js";
import { api } from "./api.js";
import { syncImageSelection } from "./pages/import-controls.js";
import { renderDraft } from "./editors/question.js";
import { tab } from "./pages/navigation.js";
import { initImport } from "./pages/import.js";
import { loadBank, renderBank } from "./pages/bank.js";
import {
  renderSelection,
  loadWorksheets,
  initWorksheet,
} from "./pages/worksheet.js";
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
on("selection-changed", () => {
  renderBank();
  renderSelection();
});
on("compose-opened", renderSelection);
initImport();
initWorksheet();
$("refresh").onclick = run(loadBank);
for (const id of ["search", "kind-filter", "subject-filter"])
  $(id).oninput = renderBank;
syncImageSelection();
renderDraft();
renderSelection();
run(async () => {
  await Promise.all([
    loadBank(),
    loadWorksheets(),
    api("/api/status").then((s) => {
      $("status").textContent = s.message;
    }),
  ]);
})();
