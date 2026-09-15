import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260915120000_company_role_event_pipeline.sql",
    import.meta.url
  ),
  "utf8"
);
const deliveryRoute = readFileSync(
  new URL(
    "../../app/api/internal/company-context-runs/post-calibration-notice/route.ts",
    import.meta.url
  ),
  "utf8"
);

test("first calibration Slack receipt schedules one exact +12 hour run", () => {
  assert.match(migration, /v_sent_at \+ interval '12 hours'/);
  assert.match(migration, /company_context_runs_post_calibration_unique_idx/);
  assert.match(migration, /trigger_reason = 'post_calibration_12h'/);
  assert.match(migration, /perform public\.enqueue_post_calibration_company_context_run_v1/);
  assert.match(migration, /superseded_by_calibration_pipeline/);
  assert.doesNotMatch(
    migration.match(
      /create or replace function public\.enqueue_due_company_context_runs_v1[\s\S]*?\n\$\$;/
    )?.[0] ?? "",
    /'role_created'/
  );
});

test("post-calibration claim rechecks delivery, role, automation, and test isolation", () => {
  const claim = migration.match(
    /create or replace function public\.claim_post_calibration_company_context_run_v1[\s\S]*?\n\$\$;/
  )?.[0];
  assert.ok(claim);
  assert.match(claim, /payload->'delivery'->>'status' = 'sent'/);
  assert.match(claim, /coalesce\(internal_role\.is_auto, false\) = true/);
  assert.match(claim, /information->>'testOnly'/);
  assert.match(claim, /'post_calibration_gate_failed'/);
  assert.match(claim, /status = 'canceled'/);
  assert.match(claim, /for update of run skip locked/);
});

test("company progress notice has separate Slack and org receipts", () => {
  assert.match(deliveryRoute, /storeHarperWorkspaceConversationMessage/);
  assert.match(deliveryRoute, /sendHarperWorkspaceSlackMessage/);
  assert.match(deliveryRoute, /recordConversationMessage: false/);
  assert.match(
    deliveryRoute,
    /slackStatus !== "sent" && orgStatus === "sent"/
  );
  assert.match(deliveryRoute, /p_slack_status: slackStatus/);
  assert.match(deliveryRoute, /p_org_status: orgStatus/);
  assert.match(deliveryRoute, /post_calibration_review:/);
  assert.match(deliveryRoute, /orgStatus === "sent" \|\| slackStatus === "sent"/);
  assert.match(migration, /company_messages_post_calibration_notice_unique_idx/);
});
