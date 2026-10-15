import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261015023000_finalize_reshown_slack_update_proposals.sql"
  ),
  "utf8"
);

test("Slack finalization accepts a re-shown change only for this thread's pending, shown proposal", () => {
  assert.match(
    sql,
    /'public\.finalize_slack_company_agent_reply_v1\(uuid,text,text\)'/
  );
  assert.match(
    sql,
    /rejected_proposal_ref constant text := \$guard\$\n {5}or v_assistant\.metadata \? 'updateProposalRef'\n\$guard\$;/
  );
  for (const condition of [
    "proposal.id::text = v_assistant.metadata #>> '{updateProposalRef,proposalId}'",
    "proposal.workspace_id = v_workspace_id",
    "proposal.source = 'slack'",
    "proposal.slack_thread_id = v_thread.id",
    "proposal.status = 'pending'",
    "proposal.expires_at > v_now",
    "position(nullif(proposal.preview, '') in v_assistant.content) > 0",
  ]) assert.ok(sql.includes(condition), condition);
});

test("Slack finalization patch keeps the live function and fails on an unexpected definition", () => {
  assert.match(sql, /pg_get_functiondef\(signature::regprocedure\)/);
  assert.match(sql, /raise exception 'Unexpected updateProposalRef guard in %'/);
  assert.match(
    sql,
    /execute replace\(definition, rejected_proposal_ref, reshown_proposal_ref\)/
  );
  assert.doesNotMatch(sql, /create or replace function/i);
});
