import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
const execution = readFileSync(
  new URL("./agent/toolExecution.ts", import.meta.url),
  "utf8"
);
const detail = readFileSync(
  new URL("../../components/org/TalentDetailSimpleView.tsx", import.meta.url),
  "utf8"
);

test("company-side reactivation stays chat-only and suppresses closure history in CC mail", () => {
  assert.match(
    execution,
    /position\.stage === "pending_connection"[\s\S]*position\.stage === "process_stopped"/
  );
  assert.match(execution, /expectedPreviousStage: position\.stage/);
  assert.match(
    server,
    /previousStage === "process_stopped" && stage === "connected"/
  );
  assert.match(server, /saved_stage: "accepted"/);
  assert.match(server, /acceptReason: reactivation \? "" : acceptReason/);
  assert.match(server, /notifyOrgCandidateAcceptedSlack/);
  assert.match(detail, /currentStage === "process_stopped"\) return null/);
  assert.doesNotMatch(detail, /이 후보자와 다시 연결하시겠습니까/);
  assert.doesNotMatch(detail, /다시 연결하기/);
});
