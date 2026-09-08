import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const talentOpportunitySource = readFileSync(
  path.join(process.cwd(), "src/lib/talentOpportunity.ts"),
  "utf8"
);
const talentToolsSource = readFileSync(
  path.join(process.cwd(), "src/lib/talentOnboarding/tools.ts"),
  "utf8"
);
const roleContextSource = talentToolsSource.slice(
  talentToolsSource.indexOf("const ROLE_CONTEXT_ROLE_SELECT"),
  talentToolsSource.indexOf(
    "async function resolveRecommendedOpportunityForFeedbackUpdate"
  )
);
const priorityReviewSource = talentToolsSource.slice(
  talentToolsSource.indexOf("async function updateInternalRolePriorityReview"),
  talentToolsSource.indexOf("const TALENT_TOOL_REGISTRY")
);
const internalRoleSearchSource = readFileSync(
  path.join(process.cwd(), "src/lib/career/internalRoleSearch.ts"),
  "utf8"
);
const companyNameMigration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260905100000_internal_recommendation_company_name.sql"
  ),
  "utf8"
);

test("formal opportunity history and prompt data use company_name", () => {
  assert.match(talentOpportunitySource, /getOpportunityCompanyName/);
  assert.doesNotMatch(talentOpportunitySource, /published_name/);
});

test("recommended role context uses company_name", () => {
  assert.match(
    roleContextSource,
    /company_workspace:company_workspace!inner \([\s\S]*company_name/
  );
  assert.match(
    roleContextSource,
    /isInternalRole[\s\S]*\? workspaceCompanyName/
  );
  assert.doesNotMatch(roleContextSource, /published_name/);
});

test("formal recommendation RPC returns company_name", () => {
  assert.match(
    companyNameMigration,
    /nullif\(btrim\(workspace\.company_name\), ''\)/
  );
  assert.doesNotMatch(companyNameMigration, /workspace\.published_name/);
});

test("lookup and priority-review exceptions keep published_name", () => {
  assert.match(
    internalRoleSearchSource,
    /row\.official_job_company_name \?\? row\.published_name/
  );
  assert.match(
    priorityReviewSource,
    /priorityReviewGroupName \?\?[\s\S]*?workspace\?\.published_name/
  );
});
