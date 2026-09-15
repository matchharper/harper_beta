import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const chat = source("./chat.ts");
const migration = source(
  "../../../../supabase/migrations/20260915140000_company_message_conversation_scoped_slack_identity.sql"
);
const store = source("./store.ts");

test("the general Slack chat path reuses an exact stored user message", () => {
  const lookup = chat.indexOf("await findOrgAgentSlackUserMessage({");
  const insert = chat.indexOf(
    "userMessage = await insertOrgAgentMessage({",
    lookup
  );

  assert.ok(lookup >= 0, "the existing Slack message must be looked up");
  assert.ok(
    insert > lookup,
    "a new row is inserted only after the lookup misses"
  );
  assert.match(
    chat.slice(lookup, insert),
    /adoptInto: \{[\s\S]*conversation,[\s\S]*roleId,[\s\S]*userId: messageUserId/
  );
});

test("Slack message lookup prefers the expected conversation before a fallback", () => {
  assert.match(
    store,
    /\(target \? await findOne\(target\.conversation\.id\) : null\) \?\?[\s\S]*\(await findOne\(\)\)/
  );
  assert.match(
    store,
    /\.order\("id", \{ ascending: false \}\)[\s\S]*\.limit\(1\)/
  );
  assert.match(
    store,
    /moveError as \{ code\?: string \}[\s\S]*23505[\s\S]*findOne\(target\.conversation\.id\)/,
    "a concurrent target insert must be reused instead of surfacing another duplicate error"
  );
});

test("Slack uniqueness is scoped to one internal conversation", () => {
  const createAt = migration.indexOf(
    "create unique index if not exists company_messages_slack_conversation_message_uidx"
  );
  const dropAt = migration.indexOf(
    "drop index if exists public.company_messages_slack_message_uidx"
  );
  const proposalActivationPatchAt = migration.indexOf(
    "activate_slack_company_agent_update_proposal_v1(uuid,text,text)"
  );

  assert.ok(createAt >= 0);
  assert.ok(proposalActivationPatchAt > createAt);
  assert.ok(
    dropAt > proposalActivationPatchAt,
    "dependent conflict targets are updated before the global guard is removed"
  );
  assert.match(
    migration,
    /on public\.company_messages \(\s*conversation_id,\s*slack_thread_id,\s*slack_message_ts\s*\)/
  );
  assert.match(
    migration,
    /on conflict \(conversation_id, slack_thread_id, slack_message_ts\)/
  );
});
