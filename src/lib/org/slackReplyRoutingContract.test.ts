import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const slackTurnRoute = source(
  "../../app/api/internal/org-agent/slack-turn/route.ts"
);
const orgAgentChat = source("./agent/chat.ts");

test("thread replies to a pending update proposal bypass the reply router", () => {
  const threadReply = slackTurnRoute.indexOf(
    'clean(job.trigger_kind) === "thread_reply"'
  );
  const pendingProposal = slackTurnRoute.indexOf(
    "await hasPendingOrgAgentUpdateProposal({"
  );
  const bypass = slackTurnRoute.indexOf(
    'routingMode = "pending_update_proposal_bypass"'
  );
  const routing = slackTurnRoute.indexOf("decideHarperSlackThreadReply(");

  assert.ok(threadReply >= 0);
  assert.ok(pendingProposal > threadReply);
  assert.ok(bypass > pendingProposal);
  assert.ok(routing > bypass);
  // The bypass must read the same thread scope the company-side LLM presents
  // and resolves Slack proposals in.
  assert.match(
    slackTurnRoute,
    /hasPendingOrgAgentUpdateProposal\(\{\s*admin,\s*scopeKey: `slack:\$\{thread\.id\}`,\s*workspaceId: channel\.company_workspace_id,\s*\}\)/
  );
  assert.match(
    slackTurnRoute,
    /await runOrgAgentChat\(\{[\s\S]*?\n\s*slackThreadId: thread\.id,/
  );
  assert.match(
    orgAgentChat,
    /const scopeKey = args\.slackThreadId\s*\? `slack:\$\{args\.slackThreadId\}`[\s\S]*?"present_company_agent_update_proposal_v1"[\s\S]*?p_scope_key: scopeKey,/
  );
});
