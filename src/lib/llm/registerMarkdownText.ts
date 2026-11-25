/**
 * Lets plain Node runs (tsx tests, eval scripts) import `.md` prompt files as text.
 * Next bundles `.md` itself (next.config.mjs), so this does nothing there.
 * Import this module before any `.md` import in the same file.
 */
type MarkdownModule = { exports: unknown };
type NodeModuleApi = {
  _extensions?: Record<string, (module: MarkdownModule, filename: string) => void>;
};

const getBuiltinModule = typeof process === "undefined" || process.env.NEXT_RUNTIME
  ? undefined
  : (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
const extensions = (getBuiltinModule?.("node:module") as NodeModuleApi | undefined)?._extensions;

if (extensions && !extensions[".md"]) {
  const { readFileSync } = getBuiltinModule!("node:fs") as typeof import("node:fs");
  extensions[".md"] = (module, filename) => {
    module.exports = { __esModule: true, default: readFileSync(filename, "utf8") };
  };
}

export {};
