import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

/** Only server-owned bindings are passed here; no request-supplied filesystem paths. */
export async function readMapSource(binding: {path: string; symbol?: string}) {
  const filename = binding.path.startsWith("harper_worker/")
    ? path.resolve(process.cwd(), "..", binding.path)
    : path.resolve(process.cwd(), binding.path);
  const text = await readFile(filename, "utf8");
  if (!binding.symbol) return {text, source: binding.path};
  const file = ts.createSourceFile(binding.path, text, ts.ScriptTarget.Latest, true);
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node) || ts.isMethodDeclaration(node)) && node.name?.getText(file) === binding.symbol) found = node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error(`현재 코드에 ${binding.symbol} 선언이 없습니다.`);
  return {text: found.getText(file), source: `${binding.path}:${file.getLineAndCharacterOfPosition(found.getStart(file)).line + 1} · ${binding.symbol}`};
}
