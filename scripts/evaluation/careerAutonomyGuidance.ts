import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

/** Evaluation-only source replay. Never edits the checkout or enters product imports. */
export async function loadCareerAutonomyGuidance(revision: string) {
  const commit = execFileSync("git", ["rev-parse", "--verify", `${revision}^{commit}`], { encoding: "utf8" }).trim();
  const paths = ["src/lib/career/prompts/mainPrompt2.ts", "src/lib/career/handbooks/application.ts",
    "src/lib/career/handbooks/resume.ts", "src/lib/career/handbooks/opportunitySearch.ts",
    "src/lib/career/handbooks/registry.ts", "src/lib/llm/toolDescriptions.ts"];
  const sources = Object.fromEntries(paths.map(file => [file, execFileSync("git", ["show", `${commit}:${file}`], { encoding: "utf8" })]));
  const cache = new Map<string, any>();
  const readModule = (file: string): any => {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} as any }; cache.set(file, module.exports);
    const require = createRequire(path.resolve(file));
    const localRequire = (specifier: string) => {
      const local = specifier.startsWith("@/") ? `src/${specifier.slice(2)}.ts`
        : specifier.startsWith(".") ? path.normalize(path.join(path.dirname(file), `${specifier}.ts`)) : null;
      return local && sources[local] ? readModule(local) : require(specifier);
    };
    const output = ts.transpileModule(sources[file], { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("require", "module", "exports", output)(localRequire, module, module.exports);
    cache.set(file, module.exports); return module.exports;
  };
  const original = readModule("src/lib/career/handbooks/registry.ts");
  const main = readModule("src/lib/career/prompts/mainPrompt2.ts");
  const descriptions = readModule("src/lib/llm/toolDescriptions.ts").TOOL_DESCRIPTIONS;
  const live = await import("@/lib/career/handbooks/registry");
  const tools = await import("@/lib/llm/toolDescriptions");
  for (const book of live.CAREER_HANDBOOKS) {
    const source = original.CAREER_HANDBOOKS.find((item: any) => item.id === book.id);
    assert.ok(source); Object.assign(book, source);
  }
  tools.TOOL_DESCRIPTIONS.write_talent_context = descriptions.write_talent_context;
  live.careerHandbookLoaderTool.function.description = tools.TOOL_DESCRIPTIONS.load_handbook(live.careerHandbookCatalog());
  const mainText = main.buildCareerMainPrompt2({ outputLanguage: "Korean", positionsTabLabel: "포지션 탭" });
  return {
    commit, sources, mainText,
    catalog: live.careerHandbookCatalog(),
    memoryDescription: descriptions.write_talent_context,
    adaptPromptBlocks: (blocks: Array<{ key: string; text: string; cacheable?: boolean }>) =>
      blocks.map(block => block.key === "career_main" ? { ...block, text: mainText } : block),
  };
}
