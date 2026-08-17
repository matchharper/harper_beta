import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260812100000_idempotent_talent_onboarding.sql"
  ),
  "utf8"
);

test("onboarding finalization locks the conversation and adopts an existing submission", () => {
  assert.match(
    migration,
    /from public\.talent_conversations[\s\S]*for update;/i
  );
  assert.match(
    migration,
    /message_type = 'profile_submit'[\s\S]*if v_user_message\.id is null then/i
  );
  assert.match(
    migration,
    /update public\.talent_conversations[\s\S]*set stage = 'chat'/i
  );
});

test("resume uploads are deduplicated by content hash", () => {
  assert.match(
    migration,
    /create index if not exists talent_documents_content_sha256_idx/i
  );
  assert.doesNotMatch(
    migration,
    /create unique index if not exists talent_documents_content_sha256_idx/i
  );
  assert.match(
    migration,
    /where talent_id = p_talent_id[\s\S]*content_sha256 = p_content_sha256/i
  );
});

test("the restrictive activity impact-level constraint is removed", () => {
  assert.match(
    migration,
    /drop constraint if exists talent_activity_events_impact_level_check/i
  );
});
