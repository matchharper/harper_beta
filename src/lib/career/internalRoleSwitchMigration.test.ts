import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260901140000_talent_internal_role_switch.sql"
  ),
  "utf8"
);
const generalReviewMigration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260902110000_general_internal_role_review.sql"
  ),
  "utf8"
);
const candidateVisibilityMigration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260901122000_internal_role_candidate_visibility.sql"
  ),
  "utf8"
);
const reconsiderationMigration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260903100000_internal_role_candidate_visibility.sql"
  ),
  "utf8"
);
const decisionSafetyMigration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260903110000_internal_role_decision_safety.sql"
  ),
  "utf8"
);
const talentTools = readFileSync(
  path.join(process.cwd(), "src/lib/talentOnboarding/tools.ts"),
  "utf8"
);
const talentOpportunity = readFileSync(
  path.join(process.cwd(), "src/lib/talentOpportunity.ts"),
  "utf8"
);
const internalRoleSearch = readFileSync(
  path.join(process.cwd(), "src/lib/career/internalRoleSearch.ts"),
  "utf8"
);
const careerChatRoute = readFileSync(
  path.join(process.cwd(), "src/app/api/talent/chat/route.ts"),
  "utf8"
);
const emailAcceptanceRoute = readFileSync(
  path.join(
    process.cwd(),
    "src/app/api/internal/company-talent-requests/accept-opportunity/route.ts"
  ),
  "utf8"
);

test("presents a verified same-company fit without adding a decision table", () => {
  assert.match(
    migration,
    /set_talent_internal_role_recommendation_before_company_share_v1/
  );
  assert.match(
    migration,
    /v_source_role\.company_workspace_id is distinct from v_target_role\.company_workspace_id/
  );
  assert.match(
    migration,
    /talent_internal_role_is_candidate_visible_v1\(fit\)/
  );
  assert.match(migration, /v_target_fit\.score::numeric \/ 100/);
  assert.match(migration, /role\.status[\s\S]*<> 'active'/);
  assert.match(migration, /information ->> 'testOnly'/);
  assert.doesNotMatch(
    migration,
    /create table[\s\S]*talent_internal_opportunity_decisions/i
  );
});

test("presents an independent matched role and reuses same-company safeguards", () => {
  assert.match(
    generalReviewMigration,
    /present_talent_internal_role_recommendation_for_review_v1/
  );
  assert.match(
    generalReviewMigration,
    /talent_internal_role_is_candidate_visible_v1\(fit\)/
  );
  assert.match(generalReviewMigration, /role\.status[\s\S]*<> 'active'/);
  assert.match(generalReviewMigration, /information ->> 'testOnly'/);
  assert.match(
    generalReviewMigration,
    /source_role\.company_workspace_id = v_target_role\.company_workspace_id/
  );
  assert.match(
    generalReviewMigration,
    /model-provided source is only a hint[\s\S]*v_source_role_id := null/
  );
  assert.match(
    generalReviewMigration,
    /set_talent_internal_role_recommendation_before_company_share_v1\([\s\S]*p_accept => false/
  );
  assert.match(
    generalReviewMigration,
    /insert into public\.talent_opportunity_recommendation[\s\S]*'internal_recommendation'/
  );
  assert.match(generalReviewMigration, /v_target_fit\.score::numeric \/ 100/);
  assert.match(generalReviewMigration, /'previous_recommendation_inactive'/);
  assert.match(
    generalReviewMigration,
    /update public\.talent_opportunity_recommendation[\s\S]*where id = v_target_recommendation\.id/
  );
  assert.doesNotMatch(
    generalReviewMigration,
    /update public\.talent_opportunity_recommendation[\s\S]*role_id <> p_target_role_id/i
  );
  assert.doesNotMatch(generalReviewMigration, /create table/i);
});

test("uses one candidate-visible contract and schedules only valid reconsideration", () => {
  assert.match(
    candidateVisibilityMigration,
    /talent_internal_role_is_candidate_visible_v1/
  );
  assert.match(
    candidateVisibilityMigration,
    /candidate_fit[\s\S]*= 'unfit'[\s\S]*then false/
  );
  assert.match(
    reconsiderationMigration,
    /request_talent_internal_role_reconsideration_v1/
  );
  assert.match(
    reconsiderationMigration,
    /v_fit\.label[\s\S]*= 'hold'[\s\S]*v_fit\.role_fit[\s\S]*v_fit\.company_fit[\s\S]*v_fit\.candidate_fit[\s\S]*= 'middle'/
  );
  assert.match(reconsiderationMigration, /reevaluation_checked_at = null/);
  assert.match(
    candidateVisibilityMigration,
    /talent_internal_role_reconsideration_is_pending_v1/
  );
});

test("requires the existing candidate prerequisites and blocks company-started processes", () => {
  assert.match(migration, /is_onboarding_done/);
  assert.match(migration, /profile_visibility[\s\S]*'dont_share'/);
  assert.match(migration, /'내부:연결대기', '내부:연결됨', '내부:최종오퍼'/);
  assert.match(migration, /tag\.tag like '내부단계:%'/i);
  assert.match(migration, /'status', 'action_unavailable'/);
});

test("separates presenting the target from accepting and replacing the source", () => {
  assert.match(
    migration,
    /insert into public\.talent_opportunity_recommendation[\s\S]*'internal_recommendation'/
  );
  assert.match(migration, /if p_accept then[\s\S]*saved_stage = 'closed'/);
  assert.match(
    migration,
    /set feedback = 'dislike',[\s\S]*feedback_reason = '해당 회사의 다른 역할을 우선 선택',[\s\S]*saved_stage = 'closed'/
  );
  assert.doesNotMatch(migration, /when feedback is null then 'dislike'/);
  assert.doesNotMatch(migration, /processed_stage = 'candidate_role_switched'/);
  assert.match(
    migration,
    /set fit_summary = case when p_accept then fit_summary else v_target_fit_summary end,[\s\S]*fit_reasons = case when p_accept then fit_reasons else v_target_fit_reasons end,[\s\S]*feedback = case when p_accept then 'like' else null end[\s\S]*saved_stage = case when p_accept then 'connected' else null end/
  );
  assert.match(
    migration,
    /update public\.talent_opportunity_fit[\s\S]*set recommend = true[\s\S]*where id = v_target_fit\.id/
  );
  assert.match(
    migration,
    /v_target_role\.summary -> v_summary_language ->> 'content'/
  );
  assert.match(migration, /p_context[\s\S]*'fitReasons'/);
  assert.doesNotMatch(migration, /jsonb_build_array\(v_target_fit\.reason\)/);
  assert.match(migration, /'내부:아카이브'/);
  assert.match(migration, /'내부:수락'/);
  assert.match(migration, /'candidate_role_recommendation_presented'/);
  assert.match(migration, /'candidate_role_recommendation_accepted'/);
  assert.match(migration, /'sourceRoleId'/);
  assert.match(migration, /'targetRoleId'/);
  assert.doesNotMatch(migration, /'communicationPlan'/);
  assert.match(migration, /'companyShared', false/);
});

test("career reuses the existing tools for review first and later acceptance", () => {
  assert.match(talentTools, /sourceRoleId/);
  assert.match(talentTools, /enum: \["register", "withdraw"\]/);
  assert.doesNotMatch(talentTools, /enum: \["register", "switch_role"/);
  assert.match(talentTools, /replacesRoleId/);
  assert.match(talentTools, /enum: \["review", "like", "dislike"\]/);
  assert.match(
    talentTools,
    /present_talent_internal_role_recommendation_for_review_v1/
  );
  assert.match(
    talentTools,
    /role has been added as a formal recommendation, but it has not been accepted/
  );
  assert.match(talentTools, /internal_role_review_required/);
  assert.match(
    talentOpportunity,
    /sourceType === "internal"[\s\S]*allowInternalRecommendationCreation/
  );
  assert.match(
    generalReviewMigration,
    /v_target_role\.summary -> v_summary_language ->> 'content'/
  );
  assert.match(generalReviewMigration, /p_context[\s\S]*'fitReasons'/);
  assert.doesNotMatch(
    generalReviewMigration,
    /jsonb_build_array\(v_target_fit\.reason\)/
  );
  assert.match(internalRoleSearch, /sourceRoleId/);
  assert.match(internalRoleSearch, /sourceRelationship/);
  assert.match(
    internalRoleSearch,
    /a verified alternative can be added for review without acceptance/
  );
  assert.match(
    careerChatRoute,
    /UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK[\s\S]*emitOpportunityRecommendationsChanged/
  );
  assert.match(
    talentOpportunity,
    /candidate_role_recommendation_presented[\s\S]*accept_talent_internal_role_recommendation_v1/
  );
  assert.match(
    emailAcceptanceRoute,
    /updateTalentOpportunityHistoryItem\([\s\S]*feedback: "positive"/
  );
  assert.doesNotMatch(
    emailAcceptanceRoute,
    /talent_opportunity_recommendation" as any\)[\s\S]*\.update\(\{[\s\S]*feedback: "like"/
  );
});

test("uses one atomic acceptance entry point with narrower same-company switching", () => {
  assert.match(
    decisionSafetyMigration,
    /accept_talent_internal_role_recommendation_v1/
  );
  assert.match(
    decisionSafetyMigration,
    /v_role\.status[\s\S]*<> 'active'[\s\S]*v_role\.is_expired[\s\S]*v_role\.expires_at[\s\S]*information ->> 'testOnly'/
  );
  assert.match(
    decisionSafetyMigration,
    /p_source_role_id is not null[\s\S]*set_talent_internal_role_recommendation_before_company_share_v1[\s\S]*p_accept => true/
  );
  assert.match(
    decisionSafetyMigration,
    /update_talent_role_feedback_v1\([\s\S]*p_feedback => 'like'[\s\S]*p_saved_stage => 'connected'/
  );
  assert.match(
    decisionSafetyMigration,
    /email_acceptance_confirmation[\s\S]*internal_role_acceptance_metadata_target_not_found/
  );
  assert.match(
    talentOpportunity,
    /accept_talent_internal_role_recommendation_v1[\s\S]*p_email_acceptance_confirmation[\s\S]*p_source_role_id/
  );
});

test("guards rejection revert in the UI and again inside the database action", () => {
  assert.match(
    decisionSafetyMigration,
    /change_internal_talent_opportunity_decision_v2/
  );
  assert.match(
    decisionSafetyMigration,
    /p_action = 'revert'[\s\S]*v_role\.status[\s\S]*<> 'active'[\s\S]*v_role\.is_expired[\s\S]*v_role\.expires_at[\s\S]*inactive_internal_role_cannot_be_reverted/
  );
  assert.match(
    decisionSafetyMigration,
    /change_internal_talent_opportunity_decision\(/
  );
});
