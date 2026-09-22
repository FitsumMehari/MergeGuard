const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const ts = createRequire(path.join(__dirname, "../packages/analyzer/package.json"))("typescript");

const roots = ["apps", "packages"];
let checked = 0;
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "dist" && entry.name !== "node_modules") walk(next);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      const src = fs.readFileSync(next, "utf8");
      const out = ts.transpileModule(src, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve },
        fileName: next,
        reportDiagnostics: true,
      });
      const errors = (out.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
      if (errors.length) {
        failures.push([next, errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))]);
      }
      checked++;
    }
  }
}

roots.forEach(walk);
if (failures.length) {
  for (const [file, diagnostics] of failures) console.error(file, diagnostics);
  process.exit(1);
}
console.log(`syntax/transpile check passed: ${checked} TypeScript/TSX files`);
