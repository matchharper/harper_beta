import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260908160000_org_agent_contact_reads.sql",
  "utf8"
);
const reader = readFileSync("src/lib/org/agent/contacts.ts", "utf8");

test("contact index is a read-only projection over existing communication sources", () => {
  assert.match(
    migration,
    /create or replace function public\.list_company_contact_index_v1/
  );
  assert.match(migration, /from public\.company_talent_requests/);
  assert.match(migration, /from public\.meeting_schedules/);
  assert.match(migration, /from public\.career_email_messages/);
  assert.match(migration, /'internal_connection_confirmed'/);
  assert.match(migration, /'internal_candidate_role_changed'/);
  assert.match(migration, /union all/);
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /materialized view/i);
  assert.match(migration, /security invoker/);
  assert.match(migration, /from public, anon, authenticated/);
});

test("sent contact lookup uses verified sent timestamps", () => {
  assert.match(migration, /when 'sent' then contact\.sent_at/);
  assert.match(migration, /selected\.selected_activity_at is not null/);
  assert.match(migration, /talent\.deleted_at is null/);
  assert.match(
    migration,
    /coalesce\(source_message\.created_at, delivery\.created_at\) as created_at/
  );
  assert.match(
    migration,
    /order by selected\.selected_activity_at desc, selected\.kind, selected\.source_id desc/
  );
  assert.match(
    migration,
    /career_email_messages_org_intro_reply_recommendation_idx/
  );
  assert.match(
    migration,
    /where direction = 'inbound'\s+and status = 'received'\s+and mail_type = 'org_intro_reply'/
  );
});

test("deleted candidates are excluded from every contact list and detail source", () => {
  assert.equal(
    (migration.match(/talent\.deleted_at is null/g) ?? []).length,
    4
  );
  assert.equal(
    (reader.match(/\.is\("talent\.deleted_at", null\)/g) ?? []).length,
    2
  );
  assert.equal((reader.match(/\.is\("deleted_at", null\)/g) ?? []).length, 2);
});
