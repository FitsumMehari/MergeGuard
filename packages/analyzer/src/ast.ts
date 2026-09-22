import ts from "typescript";
import type { CandidateFinding, ChangedFile, FindingCategory, Severity } from "@mergeguard/core";
import { addedLineRanges, stableId } from "@mergeguard/core";

export function astCandidates(file: ChangedFile): CandidateFinding[] {
  const text = file.headContent || "";
  const kind = file.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file.path, text, ts.ScriptTarget.Latest, true, kind);
  const out: CandidateFinding[] = [];
  const added = addedLineRanges(file.patch);
  const changedLine = (line: number) => added.length === 0 || added.some(([a, b]) => line >= a && line <= b);

  const add = (
    name: string,
    node: ts.Node,
    category: FindingCategory,
    severity: Severity,
    title: string,
    description: string,
    remediation: string,
    confidence: number,
    edge?: string,
  ) => {
    const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const line = pos.line + 1;
    if (!changedLine(line)) return;
    out.push({
      id: stableId([file.path, name, String(line)]),
      detector: name,
      category,
      severity,
      title,
      description,
      file: file.path,
      startLine: line,
      evidence: [node.getText(sourceFile).slice(0, 350)],
      remediation,
      edgeCase: edge ? { scenario: edge } : undefined,
      suggestedTest: edge ? `Add a test for: ${edge}` : undefined,
      reviewerConfidence: confidence,
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node) && "body" in node && node.body) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const end = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
      const lines = end - start + 1;
      const metrics = complexity(node);
      if (lines > 120 && metrics.branches > 12) {
        add(
          "complex-function",
          node,
          "maintainability",
          "low",
          "Large, branch-heavy function",
          `This changed function spans about ${lines} lines with ${metrics.branches} branching points, increasing review and test complexity.`,
          "Extract coherent responsibilities or simplify branching where that reduces cognitive load.",
          0.55,
        );
      }
      if (metrics.maxDepth >= 5) {
        add(
          "deep-nesting",
          node,
          "readability",
          "low",
          "Deeply nested control flow",
          `This changed function reaches nesting depth ${metrics.maxDepth}, making edge paths harder to reason about.`,
          "Use guard clauses or extract nested branches when semantics remain clear.",
          0.53,
        );
      }
      const boolParams = node.parameters.filter((p) => p.type?.kind === ts.SyntaxKind.BooleanKeyword).length;
      if (boolParams >= 3) {
        add(
          "boolean-params",
          node,
          "readability",
          "low",
          "Multiple boolean parameters",
          `${boolParams} boolean parameters make call sites difficult to interpret and increase state combinations.`,
          "Prefer an options object or domain-specific enum when these flags represent distinct modes.",
          0.52,
        );
      }
      if (node.parameters.length >= 7) {
        add(
          "many-params",
          node,
          "maintainability",
          "low",
          "High parameter count",
          `This function accepts ${node.parameters.length} parameters, which can indicate responsibility/coupling growth.`,
          "Consider grouping cohesive parameters or extracting a domain object if the coupling is real.",
          0.5,
        );
      }
    }
    if (ts.isNonNullExpression(node)) {
      add(
        "ast-non-null",
        node,
        "bug",
        "low",
        "Non-null assertion on changed expression",
        "The ! operator suppresses compile-time null checking without runtime validation.",
        "Validate the invariant before use or encode non-nullability in the producing API.",
        0.58,
        "The asserted value is null or undefined at runtime.",
      );
    }
    if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
      add(
        "as-any",
        node,
        "maintainability",
        "low",
        "Type safety bypassed with `as any`",
        "Casting to any removes compiler guarantees around this changed expression.",
        "Use a narrow interface/type guard instead of any where practical.",
        0.5,
        "The runtime shape differs from the assumed shape.",
      );
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      if (name === "forEach" && containsAwait(node)) {
        add(
          "async-foreach",
          node,
          "bug",
          "high",
          "Async callback passed to forEach",
          "Array.forEach does not await async callbacks, so the outer flow can finish before operations complete.",
          "Use for...of for sequential work or Promise.all(items.map(...)) with bounded concurrency as needed.",
          0.9,
          "A caller assumes all async side effects are finished when forEach returns.",
        );
      }
      if (name === "reduce" && node.arguments.length && isAsyncFunction(node.arguments[0]!)) {
        add(
          "async-reduce",
          node,
          "bug",
          "medium",
          "Async reduce callback candidate",
          "Async reduce often accidentally accumulates Promises rather than resolved values unless carefully structured.",
          "Prefer an explicit loop or correctly await the accumulator.",
          0.66,
          "A later iteration receives a Promise instead of the intended accumulated value.",
        );
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return out;
}

function isAsyncFunction(node: ts.Node): boolean {
  return (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}

function containsAwait(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node) => {
    if (ts.isAwaitExpression(current)) found = true;
    if (!found) ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function complexity(root: ts.Node): { branches: number; maxDepth: number } {
  let branches = 0;
  let maxDepth = 0;
  const visit = (node: ts.Node, depth: number) => {
    const branch =
      ts.isIfStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isConditionalExpression(node) ||
      ts.isCatchClause(node);
    const nextDepth = branch ? depth + 1 : depth;
    if (branch) {
      branches++;
      maxDepth = Math.max(maxDepth, nextDepth);
    }
    ts.forEachChild(node, (child) => visit(child, nextDepth));
  };
  visit(root, 0);
  return { branches, maxDepth };
}
