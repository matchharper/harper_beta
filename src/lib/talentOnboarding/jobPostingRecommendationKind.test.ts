import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./jobPostingRecommendations.ts", import.meta.url),
  "utf8"
);

test("recommend_job_postings recommendations persist their source kind", () => {
  const persistStart = source.indexOf("async function persistRecommendations");
  const persistEnd = source.indexOf(
    "function extractRequestedPostingCount",
    persistStart
  );

  assert.notEqual(persistStart, -1);
  assert.notEqual(persistEnd, -1);
  assert.match(
    source.slice(persistStart, persistEnd),
    /kind:\s*"recommend_job_postings"/
  );
});
