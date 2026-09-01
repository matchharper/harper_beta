import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260901100000_company_talent_request_multi_candidate_source.sql"
  ),
  "utf8"
);

test("one company message can create idempotent requests for several candidates", () => {
  assert.match(
    migration,
    /drop index if exists public\.company_talent_requests_source_message_uidx/
  );
  assert.match(
    migration,
    /unique index if not exists company_talent_requests_source_message_target_uidx[\s\S]*source_company_message_id,[\s\S]*role_id,[\s\S]*talent_id/
  );
  assert.match(
    migration,
    /where source_company_message_id = p_source_company_message_id[\s\S]*company_workspace_id = p_workspace_id[\s\S]*role_id = p_role_id[\s\S]*talent_id = p_talent_id/
  );
});
