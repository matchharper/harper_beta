import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const toolsSource = readFileSync(
  new URL("./tools.ts", import.meta.url),
  "utf8"
);
const priorityReviewSource = toolsSource.slice(
  toolsSource.indexOf("async function updateInternalRolePriorityReview"),
  toolsSource.indexOf("const TALENT_TOOL_REGISTRY")
);
const registryStart = toolsSource.indexOf("const TALENT_TOOL_REGISTRY");
const priorityReviewRegistrySource = toolsSource.slice(
  toolsSource.indexOf(
    "[TALENT_TOOL_NAMES.INTERNAL_ROLE_PRIORITY_REVIEW]",
    registryStart
  ),
  toolsSource.indexOf("[TALENT_TOOL_NAMES.GET_ROLE_CONTEXT]", registryStart)
);
const internalRoleSearchSource = readFileSync(
  path.join(process.cwd(), "src/lib/career/internalRoleSearch.ts"),
  "utf8"
);
const chatRouteSource = readFileSync(
  path.join(process.cwd(), "src/app/api/talent/chat/route.ts"),
  "utf8"
);
const chatTurnSource = readFileSync(
  path.join(process.cwd(), "src/lib/career/chatTurn.ts"),
  "utf8"
);
const priorityReviewGuidanceSource = readFileSync(
  path.join(
    process.cwd(),
    "src/lib/talentOnboarding/internalRolePriorityReviewGuidance.ts"
  ),
  "utf8"
);
const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260902100000_internal_role_priority_review_idempotency.sql"
  ),
  "utf8"
);

test("priority review omits role summary while returning identity and fit state", () => {
  assert.doesNotMatch(priorityReviewSource, /information,\s*summary,/);
  assert.doesNotMatch(priorityReviewSource, /roleRecord\.summary/);
  assert.doesNotMatch(priorityReviewSource, /roleSummary/);
  assert.match(
    priorityReviewSource,
    /select\([\s\S]*?"id, label, human_label, recommend, reason, role_fit, candidate_fit, company_fit, reevaluation_criteria, reevaluation_checked_at"[\s\S]*?\)/
  );
  assert.match(priorityReviewSource, /: "already_formally_recommended"/);
  assert.match(priorityReviewSource, /postingRoleIds: \[roleId\]/);
});

test("role availability and recommendation state are handled before new insertion", () => {
  const recommendedIndex = priorityReviewSource.indexOf(
    "if (latestRecommendation)"
  );
  const unavailableIndex = priorityReviewSource.indexOf(
    "getUnavailableInternalRolePriorityReviewStatus"
  );
  const insertIndex = priorityReviewSource.indexOf(".insert({");

  assert.ok(recommendedIndex > 0);
  assert.ok(unavailableIndex > 0);
  assert.ok(recommendedIndex > unavailableIndex);
  assert.ok(insertIndex > unavailableIndex);
  assert.match(priorityReviewSource, /"previously_declined"/);
  assert.match(priorityReviewSource, /"previous_process_closed"/);
  assert.match(priorityReviewSource, /"already_accepted"/);
  assert.match(priorityReviewSource, /!existingCreatedAt/);
  assert.match(priorityReviewSource, /insertError\.code[\s\S]*?"23505"/);
});

test("paused roles remain eligible for priority review, and configured role groups use group guidance", () => {
  assert.match(
    priorityReviewSource,
    /roleAvailability === "active" \|\|\s*roleAvailability === "hiring_paused"/
  );
  assert.match(
    priorityReviewRegistrySource,
    /specific Harper-connected internal role/
  );
  assert.match(
    priorityReviewSource,
    /priorityReviewGroupName \?\?[\s\S]*?workspace\?\.published_name/
  );
  assert.match(
    priorityReviewGuidanceSource,
    /group of related roles, not a company or one specific job/
  );
  assert.match(
    priorityReviewGuidanceSource,
    /prioritize reviewing suitable roles across this group/
  );
});

test("the database keeps one earliest priority request per talent and role", () => {
  assert.match(migration, /order by created_at asc, id asc/i);
  assert.match(migration, /duplicate\.duplicate_rank > 1/i);
  assert.match(
    migration,
    /create unique index[\s\S]*?on public\.talent_progress \(talent_id, role_id\)[\s\S]*?where kind = 'candidate_requested_connection'/i
  );
});

test("requested roles advertise the idempotent status read and recommendation card", () => {
  assert.match(
    priorityReviewRegistrySource,
    /Register is idempotent:[\s\S]*?read its current review progress without creating a duplicate/
  );
  assert.match(
    internalRoleSearchSource,
    /Repeating register is idempotent and returns the current review progress/
  );
  assert.match(
    internalRoleSearchSource,
    /latest_recommendation\.id IS NULL[\s\S]*?INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND/
  );
  assert.match(
    chatRouteSource,
    /rememberRecommendationPostingRoleIds\(result\)/
  );
  assert.match(
    chatTurnSource,
    /rememberRecommendationPostingRoleIds\(result\)/
  );
  assert.match(
    priorityReviewRegistrySource,
    /skipCommonAssistantInstruction: true/
  );
});
