import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readMapSource } from "./source";

test("source inspection follows edits and moved declarations, and never falls back to a stale snapshot", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "career-map-source-"));
  const file = path.join(directory, "prompt.ts");
  const binding = {path: file, symbol: "prompt"};
  try {
    await writeFile(file, 'export const prompt = "before";');
    assert.match((await readMapSource(binding)).text, /before/);
    await writeFile(file, '\n\nexport const prompt = "after";');
    const changed = await readMapSource(binding);
    assert.match(changed.text, /after/);
    assert.match(changed.source, /:3 · prompt$/);
    await writeFile(file, 'export const renamed = "after";');
    await assert.rejects(readMapSource(binding), /prompt 선언이 없습니다/);
    await rm(file);
    await assert.rejects(readMapSource(binding), /ENOENT/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
