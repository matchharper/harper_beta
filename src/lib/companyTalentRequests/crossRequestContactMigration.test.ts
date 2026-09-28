import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260927040514_remove_cross_request_candidate_contact_blocking.sql",
  "utf8"
);
const server = readFileSync("src/lib/companyTalentRequests/server.ts", "utf8");
const executor = readFileSync("src/lib/org/agent/toolExecution.ts", "utf8");
const reengagement = readFileSync(
  "src/lib/internalCandidateReengagement.ts",
  "utf8"
);

test("separate user messages do not reserve one unresolved candidate contact slot", () => {
  assert.match(
    migration,
    /drop index if exists public\.company_talent_requests_workspace_role_talent_open_uidx/
  );
  const sendFunction =
    migration.match(
      /create or replace function public\.send_company_talent_contact_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "";
  assert.doesNotMatch(sendFunction, /company_talent_request_already_active/);
  assert.doesNotMatch(
    sendFunction,
    /workflow_status in \('draft',\s*'queued',\s*'failed'\)/
  );
  assert.match(sendFunction, /company-contact-source:/);
  assert.match(sendFunction, /p_source_company_message_id::text/);
});

test("application paths do not preempt a new contact with another unresolved request", () => {
  for (const source of [server, executor, reengagement]) {
    assert.doesNotMatch(
      source,
      /fetchBlockingCompanyTalentRequestForWorkspace/
    );
    assert.doesNotMatch(source, /company_talent_request_already_active/);
    assert.doesNotMatch(
      source,
      /company_talent_requests_workspace_role_talent_open_uidx/
    );
  }
});
