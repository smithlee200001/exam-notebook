// Run the browser's actual ES modules in an isolated DOM fixture.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../../static/js");
const examples = JSON.parse(
  fs.readFileSync(path.resolve(root, "../examples/questions.json"), "utf8"),
);
async function loadModules(context, application = false) {
  const modules = new Map();
  for (const file of fs
    .readdirSync(root, { recursive: true })
    .filter((f) => f.endsWith(".js"))) {
    const filename = path.resolve(root, file);
    modules.set(
      filename,
      new vm.SourceTextModule(fs.readFileSync(filename, "utf8"), {
        context,
        identifier: filename,
      }),
    );
  }
  const source = [
    "import * as Geometry from './render/geometry.js';",
    "import * as Blocks from './render/blocks.js';",
    "import * as Answers from './answers.js';",
    "export {Geometry,Blocks,Answers};",
    ...(application
      ? [
          "import './main.js';",
          "export {$} from './dom.js';",
          "export {state} from './model/state.js';",
          "export {renderDraft} from './editors/question.js';",
          "export {renderQuestion} from './render/question.js';",
          "export {renderPaper,renderSelection} from './pages/worksheet.js';",
          "export {crop,clearImageSelection} from './pages/import-controls.js';",
        ]
      : []),
  ].join("\n");
  const entry = new vm.SourceTextModule(source, {
    context,
    identifier: path.join(root, "test-entry.js"),
  });
  await entry.link((specifier, referencing) => {
    const filename = path.resolve(
      path.dirname(referencing.identifier),
      specifier,
    );
    if (!modules.has(filename)) throw Error("Missing module: " + filename);
    return modules.get(filename);
  });
  await entry.evaluate();
  Object.assign(context, entry.namespace);
  // Retain convenient test expressions without introducing browser globals.
  if (application)
    for (const key of Object.keys(context.state))
      Object.defineProperty(context, key, {
        configurable: true,
        get: () => context.state[key],
        set: (value) => (context.state[key] = value),
      });
  vm.runInContext(
    "function createDemoQuestions(){return " + JSON.stringify(examples) + ";}",
    context,
  );
}
module.exports = { loadModules, examples };
