import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260915110000_company_contact_summary.sql"
  ),
  "utf8"
);

test("contact summary reuses the contact index and counts only verified milestones", () => {
  assert.match(
    sql,
    /create or replace function public\.summarize_company_contact_index_v1/
  );
  assert.match(sql, /public\.list_company_contact_index_v2\(/);
  assert.match(sql, /contact_row\.workflow_status = 'draft'/);
  assert.match(sql, /contact_row\.expires_at > resolved_as_of/);
  assert.match(sql, /contact_row\.sent_at is not null/);
  assert.match(sql, /coalesce\(contact_row\.has_response, false\)/);
  assert.match(sql, /contact_row\.response_received_at is not null/);
});

test("contact summary is service-role only", () => {
  assert.match(
    sql,
    /revoke all on function public\.summarize_company_contact_index_v1\([\s\S]*from public, anon, authenticated;/
  );
  assert.match(
    sql,
    /grant execute on function public\.summarize_company_contact_index_v1\([\s\S]*to service_role;/
  );
});
