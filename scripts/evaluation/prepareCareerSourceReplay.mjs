import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

// Replay an uncommitted product prompt revision captured by evalCareerAgentAutonomy.
// Keep the current evaluation adapter so both sides see the same evidence.
const run = process.argv[2];
assert.ok(run, "Pass a saved run directory containing sources.json");
const source = JSON.parse(readFileSync(join(run, "sources.json"), "utf8"));
const workspace = process.cwd();
const cache = join(workspace, ".local/career-source-replays");
mkdirSync(cache, { recursive: true, mode: 0o700 });
const destination = mkdtempSync(join(cache, "run-"));
const productFiles = Object.keys(source).filter(file => file.startsWith("src/"));
for (const file of productFiles) assert.equal(file, normalize(file), "Archived paths must be relative to src/");
const overlays = new Set(productFiles.filter(file => source[file] !== readFileSync(file, "utf8")));
const relativeImports = file => Array.from(source[file].matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g),
  match => normalize(join(dirname(file), match[1])));
const resolvedFiles = stem => [stem, stem + ".ts", stem + ".tsx", join(stem, "index.ts"), join(stem, "index.tsx")];

// Relative imports do not go through an alias. Replay those importers too.
let before;
do {
  before = overlays.size;
  for (const file of productFiles) {
    if (relativeImports(file).some(stem => resolvedFiles(stem).some(path => overlays.has(path)))) overlays.add(file);
  }
} while (before !== overlays.size);

const paths = { "@/*": [relative(destination, join(workspace, "src")) + "/*"], "server-only": [relative(destination, resolve("scripts/serverOnlyStub.ts"))] };
const files = {};
for (const file of overlays) {
  const target = join(destination, file);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, source[file], { mode: 0o600 });
  files[file] = relative(workspace, target);
  paths["@/" + file.replace(/^src\//, "").replace(/\.tsx?$/, "")] = ["./" + file];
}
for (const file of overlays) {
  for (const stem of relativeImports(file)) {
    const realPath = resolvedFiles(stem).find(f => existsSync(f) && !f.endsWith("/") && (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".json")));
    if (!realPath) continue;
    const target = join(destination, realPath);
    if (existsSync(target)) continue;
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    symlinkSync(resolve(realPath), target);
  }
}
writeFileSync(join(destination, "tsconfig.json"), JSON.stringify({ extends: relative(destination, resolve("scripts/tsconfig.json")), compilerOptions: { paths } }, null, 2), { mode: 0o600 });
writeFileSync(join(destination, "overlays.json"), JSON.stringify(files, null, 2), { mode: 0o600 });
console.log(relative(workspace, destination));
