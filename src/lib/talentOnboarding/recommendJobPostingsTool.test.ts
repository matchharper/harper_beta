import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("recommend_job_postings exposes instant and bulk search kinds", () => {
  const source = readFileSync(new URL("./tools.ts", import.meta.url), "utf8");
  const registryStart = source.indexOf("const TALENT_TOOL_REGISTRY");
  const start = source.indexOf(
    "[TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS]",
    registryStart
  );
  const end = source.indexOf("[TALENT_TOOL_NAMES.RESEARCH_COMPANY]", start);
  const implementation = source.slice(start, end);

  assert.match(implementation, /enum: \["instant", "bulk"\]/);
  assert.match(implementation, /default: "instant"/);
  assert.match(implementation, /service accepts up to 20/);
});

test("instant is pinned to legacy while only bulk reaches async enqueue", () => {
  const source = readFileSync(new URL("./tools.ts", import.meta.url), "utf8");
  const registryStart = source.indexOf("const TALENT_TOOL_REGISTRY");
  const start = source.indexOf(
    "[TALENT_TOOL_NAMES.RECOMMEND_JOB_POSTINGS]",
    registryStart
  );
  const end = source.indexOf("[TALENT_TOOL_NAMES.RESEARCH_COMPANY]", start);
  const implementation = source.slice(start, end);

  assert.match(implementation, /if \(kind === "bulk"\)/);
  assert.match(implementation, /return enqueueOnDemandJobSearch\(/);
  assert.match(implementation, /strategy: "legacy"/);
  assert.doesNotMatch(implementation, /AsyncWorkerEnabled/);
  assert.doesNotMatch(implementation, /bulk_search_unavailable/);
});
