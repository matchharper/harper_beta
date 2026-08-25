import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("active candidate workflows bypass probabilistic Slack reply routing", () => {
  assert.match(source, /hasActiveCandidateWorkflowInSlackThread/);
  assert.match(source, /candidateConnectionConfirmations/);
  assert.match(source, /contactDraftRef/);
  assert.match(source, /COMPANY_TALENT_REQUEST_BLOCKING_STATUSES/);
  assert.match(source, /routingMode = "candidate_workflow_bypass"/);
});
