import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260908150000_company_talent_request_reply_without_deadline.sql",
  "utf8"
);
const parallelSentMigration = readFileSync(
  "supabase/migrations/20260909140000_company_talent_request_parallel_sent.sql",
  "utf8"
);
const server = readFileSync("src/lib/companyTalentRequests/server.ts", "utf8");
const contacts = readFileSync("src/lib/org/agent/contacts.ts", "utf8");

test("sent company requests keep accepting a first reply until the Role ends", () => {
  assert.match(
    migration,
    /role\.status, 'active'\) not in \('ended', 'deleted'\)[\s\S]*delivery\.status = 'sent'/
  );
  assert.match(
    migration,
    /record_company_talent_response_v1[\s\S]*workflow_status not in \('awaiting_talent', 'closed'\)[\s\S]*expires_at = 'infinity'::timestamptz/
  );
  assert.doesNotMatch(
    migration.match(
      /create or replace function public\.record_company_talent_response_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "",
    /v_request\.expires_at <=/
  );
});

test("a company-visible stopped process can receive a new candidate request", () => {
  assert.match(
    migration,
    /company_talent_request_target_is_active_v1[\s\S]*'내부:연결대기'[\s\S]*'내부:프로세스중단'[\s\S]*'내부단계:%'/
  );
});

test("sent-request reads do not apply the draft deadline", () => {
  assert.match(
    migration,
    /update public\.email_reply_aliases alias[\s\S]*set expires_at = null/
  );
  assert.match(
    server,
    /candidateEmailSent && !hasResponse && companyRequestRoleIsOpen\(row\)/
  );
  assert.match(server, /\["awaiting_talent", "closed"\]/);
  assert.match(server, /args\.ttlSeconds \?\? 90 \* 86400/);
});

test("sent requests no longer reserve the candidate contact slot", () => {
  const indexSql =
    parallelSentMigration.match(
      /create unique index company_talent_requests_workspace_role_talent_open_uidx[\s\S]*?;/
    )?.[0] ?? "";
  assert.match(indexSql, /workflow_status in \('draft', 'queued', 'failed'\)/);
  assert.doesNotMatch(indexSql, /awaiting_talent/);
  assert.doesNotMatch(indexSql, /relay_queued/);
  assert.doesNotMatch(indexSql, /review_required/);
  assert.match(indexSql, /talent_source_message_id is null/);
  assert.match(indexSql, /document_id is null/);
});

test("late resume replies use the same no-deadline contract", () => {
  const functionSql =
    migration.match(
      /create or replace function public\.finalize_talent_resume_upload_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(
    functionSql,
    /workflow_status not in \('awaiting_talent', 'closed'\)/
  );
  assert.match(functionSql, /delivery\.status = 'sent'/);
  assert.doesNotMatch(functionSql, /v_request\.expires_at <=/);
});

test("draft cancellation records the company as the cancellation source", () => {
  const functionSql =
    migration.match(
      /create or replace function public\.cancel_company_talent_request_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.match(functionSql, /workflow_status = 'draft'/);
  assert.match(
    functionSql,
    /'cancellation', jsonb_build_object\('source', 'company', 'at', v_now\)/
  );
  assert.match(
    functionSql,
    /'company_request_candidate_delivery',[\s\S]*'cancelled'/
  );
  assert.match(
    contacts,
    /candidate_delivery_error: text\(candidateDelivery\?\.last_error\)/
  );
  assert.match(
    contacts,
    /candidate_cancellation_source: text\(cancellation\.source\)/
  );
  assert.match(contacts, /role_is_open: roleIsOpen/);
});
