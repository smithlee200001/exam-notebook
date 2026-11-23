import { $ } from "../dom.js";
import { emit } from "../events.js";
function tab(name) {
  for (const key of ["import", "bank", "compose"])
    $(key + "-tab").hidden = key !== name;
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("primary", b.dataset.tab === name));
  if (name === "compose") emit("compose-opened");
}

export { tab };
