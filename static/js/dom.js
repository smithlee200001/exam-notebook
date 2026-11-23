const $ = (id) => document.getElementById(id);
const message = (text) => {
  $("message").textContent = text;
};
function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function button(text, fn) {
  const b = node("button", text);
  b.type = "button";
  b.onclick = fn;
  return b;
}
function field(parent, name, value, change, multiline = false) {
  const label = node("label", name),
    input = node(multiline ? "textarea" : "input");
  input.value = value;
  input.oninput = () => change(input.value);
  label.append(input);
  parent.append(label);
  return input;
}
function lines(text) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
function run(fn) {
  return async () => {
    try {
      await fn();
    } catch (e) {
      message(e.message);
    }
  };
}

export { $, message, node, button, field, lines, run };
