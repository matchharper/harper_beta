import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// #261 follow-up wiring that only shows in source: these entry points are too
// large to run in a unit test (Slack, queue and database clients).
function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const slackTurn = source("../../../app/api/internal/org-agent/slack-turn/route.ts");
const processor = source("./webActionProcessor.server.ts");
const kickoff = source("./roleSearchKickoff.server.ts");

test("every Slack turn is counted as one slack_turn, with its company known before any model call", () => {
  assert.match(slackTurn, /export async function processSlackTurn\(args: ProcessSlackTurnArgs\) \{\s*const usage: CompanyTurnUsageTarget = \{ kind: "slack_turn", sourceId: clean\(args\.jobId\) \};\s*return withCompanyTurnUsage\(usage, \(\) => runSlackTurn\(args, usage\)\);/);
  const known = slackTurn.indexOf("usage.workspaceId = channel.company_workspace_id;");
  assert.ok(known > 0);
  for (const call of ["decideHarperSlackThreadReply(", "runOrgAgentChat({", "runOrgRoleCreationChat({"]) {
    assert.ok(slackTurn.indexOf(call) > known, call);
  }
});

test("a company Harper run names itself to the work inside it", () => {
  assert.match(processor, /const usageContext = \{ requestId: message\.jobId, companyRunId: message\.jobId, companyRunUsage: runUsage \};/);
  // The kickoff's search is linked to the kickoff job only when the kickoff queued it.
  assert.match(kickoff, /if \(result\.status === "queued"\)\s*await linkOperationToRun\(\{ admin, kind: "member_search", workId: result\.runId, runId: args\.jobId \}\);/);
});
