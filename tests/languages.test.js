import test from "node:test";
import assert from "node:assert/strict";
import { review } from "../src/review.js";
import { languageForPath } from "../src/languages.js";
import { tempRepo, put, commitAll } from "./helpers.js";

const samples = [
  ["app.js", "export const x = eval(input);\n", "javascript", "dynamic-eval"],
  ["app.ts", "export const x = eval(input);\n", "typescript", "dynamic-eval"],
  ["app.py", "import requests\nrequests.get(url, verify=False)\n", "python", "tls-disabled"],
  ["App.java", "Runtime.getRuntime().exec(\"tool \" + request.getParameter(\"x\"));\n", "java", "java-process-exec"],
  ["App.kt", "Runtime.getRuntime().exec(\"tool \" + request.getParameter(\"x\"));\n", "kotlin", "java-process-exec"],
  ["main.go", "exec.Command(\"sh\", \"-c\", fmt.Sprintf(\"tool %s\", input))\n", "go", "go-shell-command"],
  ["App.cs", "Process.Start($\"tool {Request.Query[\"x\"]}\");\n", "csharp", "csharp-process"],
  ["app.php", "system(\"tool \" . $_GET[\"x\"]);\n", "php", "php-shell"],
  ["app.rb", "system(\"tool #{input}\")\n", "ruby", "ruby-shell-interpolation"],
];

test("language adapters fire on representative fixtures", async () => {
  for (const [path, content, language, detector] of samples) {
    const root = tempRepo();
    put(root, path, "// baseline\n");
    commitAll(root);
    put(root, path, content);
    const result = await review({ cwd: root, noAi: true });
    assert.equal(languageForPath(path), language, path);
    assert(result.findings.some((f) => f.detector === detector), `${path}: expected ${detector}, got ${result.findings.map((f) => f.detector).join(",")}`);
  }
});

test("unsupported-but-valid repos still review generically", async () => {
  const root = tempRepo();
  put(root, "main.rs", "fn main() {}\n");
  put(root, "main.c", "int main() { return 0; }\n");
  put(root, "main.cpp", "int main() { return 0; }\n");
  put(root, "run.sh", "echo hi\n");
  put(root, "config.yaml", "name: demo\n");
  put(root, "data.json", "{\"a\":1}\n");
  put(root, "main.tf", "resource \"null_resource\" \"x\" {}\n");
  put(root, "Dockerfile", "FROM alpine\n");
  commitAll(root);
  put(root, "main.rs", "fn main() { println!(\"ok\"); }\n");
  const result = await review({ cwd: root, noAi: true });
  assert.equal(typeof result.passed, "boolean");
  assert.equal(result.warnings.some((w) => /unsupported/i.test(w)), false);
});
