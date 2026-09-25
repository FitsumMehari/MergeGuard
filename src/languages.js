import { extname, basename } from "node:path";

const BY_EXT = new Map([
  [".js", "javascript"], [".jsx", "javascript"], [".mjs", "javascript"], [".cjs", "javascript"],
  [".ts", "typescript"], [".tsx", "typescript"], [".mts", "typescript"], [".cts", "typescript"],
  [".py", "python"], [".pyi", "python"],
  [".java", "java"], [".kt", "kotlin"], [".kts", "kotlin"],
  [".go", "go"], [".php", "php"], [".rb", "ruby"], [".cs", "csharp"],
  [".rs", "rust"], [".cpp", "cpp"], [".cc", "cpp"], [".cxx", "cpp"], [".c", "c"], [".h", "c"], [".hpp", "cpp"],
  [".swift", "swift"], [".scala", "scala"], [".ex", "elixir"], [".exs", "elixir"],
  [".sql", "sql"], [".sh", "shell"], [".bash", "shell"], [".zsh", "shell"], [".ps1", "powershell"],
  [".tf", "terraform"], [".tfvars", "terraform"],
  [".vue", "vue"], [".svelte", "svelte"],
]);

export function languageForPath(path) {
  const name = basename(path).toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "dockerfile";
  if (name === "gemfile") return "ruby";
  if (name === "makefile") return "make";
  if (/\.ya?ml$/.test(name)) return "yaml";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".xml")) return "xml";
  return BY_EXT.get(extname(name)) || "text";
}

export function isCodePath(path) {
  return languageForPath(path) !== "text" && !["json", "yaml", "xml", "make", "dockerfile"].includes(languageForPath(path));
}
