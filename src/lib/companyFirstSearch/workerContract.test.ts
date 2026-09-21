import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260917162551_company_first_talent_search.sql",
    import.meta.url
  ),
  "utf8"
);
const relaxationMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260918015954_relax_company_intro_constraints_and_fixture_guards.sql",
    import.meta.url
  ),
  "utf8"
);
const acceptanceHandoffMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260918022746_company_intro_acceptance_handoff.sql",
    import.meta.url
  ),
  "utf8"
);
const opportunityConstraintMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260918023359_relax_opportunity_pipeline_value_constraints.sql",
    import.meta.url
  ),
  "utf8"
);
const deliveryRoute = readFileSync(
  new URL(
    "../../app/api/internal/company-first/deliver/route.ts",
    import.meta.url
  ),
  "utf8"
);
const companyTalentRequestServer = readFileSync(
  new URL("../companyTalentRequests/server.ts", import.meta.url),
  "utf8"
);
const orgServer = readFileSync(
  new URL("../org/server.ts", import.meta.url),
  "utf8"
);
const internalAcceptanceRoute = readFileSync(
  new URL(
    "../../app/api/internal/company-talent-requests/accept-opportunity/route.ts",
    import.meta.url
  ),
  "utf8"
);
const talentOpportunityRoute = readFileSync(
  new URL("../../app/api/talent/opportunities/route.ts", import.meta.url),
  "utf8"
);
const connectionRetryRoute = readFileSync(
  new URL(
    "../../app/api/internal/company-first/connect-pending/route.ts",
    import.meta.url
  ),
  "utf8"
);
const vercelConfig = readFileSync(
  new URL("../../../vercel.json", import.meta.url),
  "utf8"
);

test("keeps a ready Company-first card separate from a candidate recommendation", () => {
  assert.match(
    migration,
    /create table if not exists public\.company_intro_candidates/
  );
  assert.match(
    migration,
    /status <> 'ready'[\s\S]*recommendation_id is null[\s\S]*requested_at is null/
  );
  assert.match(
    migration,
    /company_intro_candidates_active_workspace_talent_idx[\s\S]*status in \('ready', 'awaiting_talent', 'connecting'\)/
  );
});

test("requires an appeal, recipients, and a first stage before candidate delivery", () => {
  assert.match(
    relaxationMigration,
    /create or replace function public\.request_company_intro_v1/
  );
  assert.match(relaxationMigration, /if v_appeal is null then/);
  assert.doesNotMatch(relaxationMigration, /char_length\(v_appeal\)/);
  assert.match(relaxationMigration, /cardinality\(v_emails\) = 0/);
  assert.match(relaxationMigration, /company_intro_next_stage_invalid/);
  assert.match(relaxationMigration, /'companyAppeal', v_appeal/);
  assert.match(relaxationMigration, /'companyIntroCandidateId', v_intro\.id/);
});

test("keeps only relational Company-first constraints and permits exact test fixtures", () => {
  assert.match(
    relaxationMigration,
    /drop constraint if exists company_intro_candidates_status_check/
  );
  assert.match(
    relaxationMigration,
    /drop constraint if exists company_intro_candidates_request_shape_check/
  );
  assert.match(
    relaxationMigration,
    /company_intro_role_allows_talent_v1[\s\S]*testTalentIds/
  );
  assert.match(
    relaxationMigration,
    /company_user_workspace[\s\S]*company_intro_workspace_forbidden/
  );
});

test("keeps evolving opportunity pipeline vocabulary out of database checks", () => {
  for (const constraint of [
    "opportunity_discovery_run_trigger_check",
    "opportunity_discovery_run_target_count_check",
    "talent_opportunity_recommendation_opportunity_type_check",
    "talent_opportunity_recommendation_rank_check",
    "talent_opportunity_recommendation_score_check",
    "talent_opportunity_delivery_channel_check",
    "career_email_messages_status_check",
  ]) {
    assert.match(
      opportunityConstraintMigration,
      new RegExp(`drop constraint if exists ${constraint}`)
    );
  }
  assert.doesNotMatch(
    opportunityConstraintMigration,
    /talent_opportunity_recommendation_email_acceptance_confirmation/
  );
});

test("records immediate Talent decisions and privacy withdrawal", () => {
  assert.match(
    migration,
    /create or replace function public\.decide_company_intro_request_v1/
  );
  assert.match(migration, /set status = 'connecting'/);
  assert.match(migration, /close_reason = 'talent_declined'/);
  assert.match(migration, /talent_setting_close_company_intro_on_privacy/);
  assert.match(migration, /talent_user_close_company_intro_on_delete/);
  assert.match(
    migration,
    /intro\.status in \('ready', 'awaiting_talent', 'connecting'\)/
  );
  assert.match(migration, /company_role_close_company_intro_on_change/);
  assert.match(
    migration,
    /company_internal_role_close_company_intro_on_change/
  );
  assert.match(
    migration,
    /after update of is_onboarding_done, profile_visibility, get_internal_recommendation, blocked_companies/
  );
  assert.match(migration, /close_reason = 'role_closed'/);
});

test("uses one shared company-and-Talent lock for candidate-first race safety", () => {
  assert.match(
    migration,
    /company_talent_route:' \|\| v_workspace_id::text \|\| ':' \|\| new\.talent_id::text/
  );
  assert.match(
    migration,
    /before insert or update of role_id, talent_id[\s\S]*on public\.talent_opportunity_recommendation/
  );
  assert.match(
    migration,
    /new\.opportunity_type = 'intro_request'[\s\S]*new\.discovery_run_id = intro\.delivery_run_id/
  );
  assert.match(
    migration,
    /route_candidate_priority_request_v1[\s\S]*company_talent_route:[\s\S]*close_reason = 'route_replaced'/
  );
  assert.match(
    migration,
    /before insert or update of kind, role_id, talent_id[\s\S]*on public\.talent_progress[\s\S]*new\.kind = 'candidate_requested_connection'/
  );
});

test("keeps new selection and outbox tables service-only", () => {
  assert.match(
    migration,
    /alter table public\.company_intro_candidates enable row level security/
  );
  assert.match(
    migration,
    /revoke all on table public\.company_intro_candidates[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.company_intro_candidates[\s\S]*to service_role/
  );
});

test("blocks ordinary company actions until the requested introduction is connected", () => {
  assert.match(
    companyTalentRequestServer,
    /assertCompanyIntroRequestIsNotPending\(args\)/
  );
  assert.match(
    companyTalentRequestServer,
    /in\("status", \["ready", "awaiting_talent", "connecting"\]\)/
  );
  assert.match(
    orgServer,
    /assertNoPendingCompanyIntroCompanyAction\(\{[\s\S]*talentId,[\s\S]*workspaceId,[\s\S]*\}\);[\s\S]*const roleRows = await fetchRoleRowsForWorkspace/
  );
});

test("Slack delivery is authenticated, state-checked, and idempotently addressed", () => {
  assert.match(deliveryRoute, /requireInternalWorkerSecret\(req\)/);
  assert.match(deliveryRoute, /company_first_outbox_is_deliverable_v1/);
  assert.match(deliveryRoute, /idempotencyKey: row\.idempotency_key/);
  assert.match(deliveryRoute, /channelId: channel\.slack_channel_id/);
  assert.match(deliveryRoute, /recordConversationMessage: true/);
});

test("routes Company-first acceptance through the canonical closure guard", () => {
  assert.match(
    internalAcceptanceRoute,
    /recommendation\.opportunity_type !== "intro_request"[\s\S]*isInternalRoleCandidateDecisionAvailable/
  );
  assert.match(
    talentOpportunityRoute,
    /previousOpportunity\.opportunityType !== OpportunityType\.IntroRequest[\s\S]*isInternalRoleCandidateDecisionAvailable/
  );
  assert.match(internalAcceptanceRoute, /error instanceof OrgHttpError/);
  assert.match(talentOpportunityRoute, /error instanceof OrgHttpError/);
});

test("retries durable connecting introductions with the idempotent mail path", () => {
  assert.match(
    acceptanceHandoffMigration,
    /v_intro\.status = 'connecting'[\s\S]*'reason', 'acceptance_already_committed'/
  );
  assert.match(
    acceptanceHandoffMigration,
    /intro\.status in \('ready', 'awaiting_talent'\)/
  );
  assert.doesNotMatch(
    acceptanceHandoffMigration,
    /intro\.status in \('ready', 'awaiting_talent', 'connecting'\)/
  );
  assert.match(
    orgServer,
    /authorizedCompanyIntroTransition[\s\S]*!internalCandidateRoleIsOpen\(role\)[\s\S]*!authorizedCompanyIntroTransition/
  );
  assert.match(orgServer, /buildOrgIntroProgressId\(companyIntro\.id\)/);
  assert.match(
    orgServer,
    /isIntroRequested = authorizedCompanyIntroTransition[\s\S]*introEmails\.length > 0/
  );
  assert.match(
    orgServer,
    /authorizedCompanyIntroTransition[\s\S]*previousStage === stage/
  );
  assert.match(
    orgServer,
    /async function upsertRecommendationProcessedStage[\s\S]*\.update\(\{[\s\S]*processed_stage: args\.stage[\s\S]*\.eq\("role_id", args\.roleId\)[\s\S]*\.eq\("talent_id", args\.talentId\)/
  );
  assert.doesNotMatch(
    orgServer,
    /async function upsertRecommendationProcessedStage[\s\S]{0,700}\.upsert\(/
  );
  assert.match(orgServer, /export async function retryConnectingCompanyIntros/);
  assert.match(orgServer, /\.eq\("status", "connecting"\)/);
  assert.match(connectionRetryRoute, /retryConnectingCompanyIntros/);
  assert.match(connectionRetryRoute, /CRON_SECRET/);
  assert.match(vercelConfig, /\/api\/internal\/company-first\/connect-pending/);
});
