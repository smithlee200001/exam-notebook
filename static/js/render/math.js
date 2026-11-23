import { node as el } from "../dom.js";
function math(parent, source, display, align) {
  const n = el(
    display ? "div" : "span",
    undefined,
    display ? "math-display" : "math-inline",
  );
  if (display) n.style.textAlign = align || "center";
  // Enlarge fractions without changing inline layout or other operators' math style.
  const macros = display ? {} : { "\\frac": "\\dfrac" };
  try {
    katex.render(source, n, {
      throwOnError: true,
      trust: false,
      output: "mathml",
      displayMode: display,
      macros,
      maxExpand: 1000,
    });
  } catch {
    n.textContent = source;
    n.title = "公式无法解析，请校对 LaTeX";
  }
  parent.append(n);
}
function rich(parent, text, align) {
  const re = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
  let pos = 0;
  for (const m of text.matchAll(re)) {
    parent.append(document.createTextNode(text.slice(pos, m.index)));
    math(parent, m[1] ?? m[2], m[2] !== undefined, align);
    pos = m.index + m[0].length;
  }
  parent.append(document.createTextNode(text.slice(pos)));
}

export { math, rich };
