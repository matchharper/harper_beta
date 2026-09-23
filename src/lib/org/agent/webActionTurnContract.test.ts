import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const chat = source("./chat.ts");
const client = source("../../../hooks/org/useOrgAgent.ts");
const companyIntroRoute = source("../../../app/api/org/company-intro/route.ts");
const roleRoute = source("../../../app/api/org/role/route.ts");
const stageRoute = source("../../../app/api/org/stage/route.ts");
const queueConsumer = source(
  "../../../app/api/queues/process-company-agent-web-action/route.ts"
);
const slackTurn = source(
  "../../../app/api/internal/org-agent/slack-turn/route.ts"
);
const migration = source(
  "../../../../supabase/migrations/20260922082129_company_agent_web_action_turns.sql"
);

test("only successful authenticated web action routes enqueue the new turn", () => {
  for (const route of [companyIntroRoute, roleRoute, stageRoute]) {
    const mutation = route.indexOf("const payload = await");
    const enqueue = route.indexOf("await enqueueOrgAgentWebActionTurn");
    assert.ok(mutation >= 0);
    assert.ok(enqueue > mutation);
  }
  assert.match(companyIntroRoute, /requireAuthenticatedUser/);
  assert.match(roleRoute, /requireAuthenticatedUser/);
  assert.match(stageRoute, /requireAuthenticatedUser/);
  assert.match(
    roleRoute,
    /body\.status !== undefined \|\| body\.isExpired !== undefined/
  );
  assert.match(roleRoute, /if \(wakesCompanySideLlm\)/);
  assert.match(companyIntroRoute, /user\.id,[\s\S]*common\.introCandidateId/);
  assert.match(stageRoute, /user\.id,[\s\S]*payload\.roleId,[\s\S]*payload\.talentId/);
  assert.match(roleRoute, /user\.id,[\s\S]*body\.roleId/);
});

test("durable jobs are service-only, idempotent, serialized, and anchored invisibly", () => {
  assert.match(migration, /message_type,[\s\S]*'web_action'/);
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(migration, /company_messages_agent_turn_phase_uidx/);
  assert.match(migration, /company_agent_web_action_jobs_dispatch_ready_idx/);
  assert.match(
    migration,
    /not exists \([\s\S]*active\.conversation_id = j\.conversation_id/
  );
  assert.match(
    migration,
    /\(earlier\.created_at, earlier\.id\) < \(j\.created_at, j\.id\)/
  );
  assert.match(migration, /enable row level security/);
  assert.equal(
    migration.match(/set search_path = public, pg_temp/g)?.length,
    2
  );
  assert.match(
    migration,
    /revoke all on table public\.company_agent_web_action_jobs[\s\S]*anon, authenticated/
  );
  assert.doesNotMatch(migration, /create trigger/i);
});

test("the company-side LLM can complete silently without losing tool freedom", () => {
  assert.match(chat, /allowSilentCompletion: true/);
  assert.match(chat, /runOrgAgentToolLoop\(\{/);
  assert.match(chat, /source: "chat"/);
  assert.match(chat, /getEnabledOrgAgentTools\(args\.surface\)/);
  assert.match(chat, /outcome: "completed_silent"/);
  assert.doesNotMatch(chat, /MAX_VISIBLE_MESSAGES/);
});

test("a newer direct user message supersedes a background action before more tools or output", () => {
  assert.match(chat, /class OrgAgentWebActionSupersededError/);
  assert.match(chat, /\.gt\("id", args\.anchorMessageId\)/);
  assert.match(chat, /await args\.assertCanContinue\?\.\(\)/);
  assert.match(queueConsumer, /status: "superseded"/);
});

test("one progress bubble does not end the browser turn or narrate every tool", () => {
  assert.match(chat, /!visibleProgressPublished/);
  assert.match(chat, /visibleProgressPublished = true/);
  assert.match(chat, /retained only as internal turn history/);
  assert.match(client, /keeping the same[\s\S]*SSE turn alive/);
  const assistantBranch = client.slice(
    client.indexOf('parsed.event === "assistant_message"'),
    client.indexOf('parsed.event === "role_created"')
  );
  assert.doesNotMatch(assistantBranch, /\.finish\(/);
});

test("Slack progress delivery is idempotent and cannot stop the tool loop", () => {
  assert.match(slackTurn, /stableSlackClientMessageId/);
  assert.match(slackTurn, /`\$\{job\.id\}:progress`/);
  assert.match(slackTurn, /progress-delivery/);
  assert.match(slackTurn, /must never stop the tool\s*\/\/ loop/);
  assert.match(slackTurn, /message_type: "agent_internal"/);
  assert.match(slackTurn, /agentTurn\.phase[\s\S]*"terminal"/);
});
