const { loadModules, examples } = require("./modules.cjs");
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs");
async function setup() {
  const all = (n) => [n, ...(n.children || []).flatMap(all)];
  const element = (tag) => ({
    tag,
    children: [],
    style: {
      setProperty(k, v) {
        this[k] = v;
      },
    },
    append(...c) {
      this.children.push(...c);
    },
    replaceChildren(...c) {
      this.children = c;
    },
    setAttribute(k, v) {
      this[k] = v;
    },
    querySelectorAll(selector) {
      return all(this).filter((n) =>
        selector === "input[type=checkbox]"
          ? n.tag === "input" && n.type === "checkbox"
          : ["textarea", "input"].includes(n.tag),
      );
    },
  });
  const context = vm.createContext({
    document: {
      createElement: element,
      createElementNS: (ns, t) => element(t),
      createTextNode: (text) => ({ textContent: text }),
    },
    console,
  });
  await loadModules(context);
  return { run: (c) => vm.runInContext(c, context), all };
}
test("all example answer pages render separately with complete coverage", async () => {
  const h = await setup();
  for (let i = 0; i < 16; i++) {
    h.run(
      `var q=createDemoQuestions()[${i}];var root=document.createElement('div');Answers.render(q,q.answer,root,q.assets||{})`,
    );
    assert.ok(
      h.all(h.run("root")).some((n) => n.textContent === "答案已完整录入。"),
    );
  }
});
test("choice labels follow reordered snapshot and missing answers remain visible", async () => {
  const h = await setup();
  h.run(
    "var q=createDemoQuestions()[2];q.blocks[1].children.reverse();var root=document.createElement('div');Answers.render(q,q.answer,root)",
  );
  assert.ok(h.all(h.run("root")).some((n) => n.textContent === "答案：C"));
  h.run("root=document.createElement('div');Answers.render(q,null,root)");
  assert.ok(h.all(h.run("root")).some((n) => n.textContent === "未录入答案"));
});
test("invalid answer JSON remains invalid when another field changes", async () => {
  const h = await setup();
  h.run(
    "var q=createDemoQuestions()[0];var root=document.createElement('div');var latest;Answers.editor(q,q.answer,root,(a,bad)=>latest={a,bad})",
  );
  const inputs = h.all(h.run("root")).filter((n) => n.tag === "textarea");
  const raw = inputs.find((n) => n.className === "geometry-editor");
  raw.value = "{broken";
  raw.oninput();
  assert.equal(h.run("latest.bad"), true);
  inputs[0].value = "8";
  inputs[0].oninput();
  assert.equal(h.run("latest.bad"), true);
  raw.value = "[]";
  raw.oninput();
  assert.equal(h.run("latest.bad"), false);
  assert.equal(h.run("latest.a.entries[0].text"), "8");
});
test("single choice editor clears other checkboxes and stores IDs", async () => {
  const h = await setup();
  h.run(
    "var q=createDemoQuestions()[2];var root=document.createElement('div');var latest;Answers.editor(q,q.answer,root,a=>latest=a)",
  );
  const checks = h.all(h.run("root")).filter((n) => n.type === "checkbox");
  checks[0].checked = true;
  checks[0].onchange();
  assert.equal(checks[1].checked, false);
  assert.equal(
    h.run("latest.entries[0].optionIds[0]"),
    h.run("q.blocks[1].children[0].id"),
  );
});

test("answer targets match the backend shared contract", async () => {
  const h = await setup();
  const expected = JSON.parse(
    fs.readFileSync(
      require("node:path").join(__dirname, "../fixtures/answer-targets.json"),
      "utf8",
    ),
  );
  const actual = h.run(
    `createDemoQuestions().map(q=>({sourceNumber:q.sourceNumber,targets:Answers.targets(q).map(t=>{if(t.options){t.optionIds=t.options.map(o=>o.id);delete t.options;}return t;})}))`,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
});
