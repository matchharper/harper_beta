import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./useCareerOpportunityRunSync.ts", import.meta.url),
  "utf8"
);

test("uses one low-frequency opportunity-run polling loop", () => {
  assert.doesNotMatch(source, /setInterval/);
  assert.match(source, /ACTIVE_OPPORTUNITY_RUN_POLL_INTERVAL_MS = 60_000/);
  assert.match(source, /IDLE_OPPORTUNITY_RUN_POLL_INTERVAL_MS = 300_000/);
  assert.match(source, /HIDDEN_OPPORTUNITY_RUN_POLL_INTERVAL_MS = 300_000/);
  assert.equal(
    source.match(/\/api\/talent\/opportunity-runs\?\$\{/g)?.length,
    1
  );
});
