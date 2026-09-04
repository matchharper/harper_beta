import assert from "node:assert/strict";
import test from "node:test";

test("role search materializes only ranking fields before FTS", async () => {
  process.env.OPENAI_API_KEY ??= "test-openai-key";
  const { buildRoleSearchSql } = await import(
    "@/lib/talentOnboarding/jobPostingRecommendations"
  );
  const sql = buildRoleSearchSql({
    blockedCompanies: [],
    plan: {
      ftsKeywords: [
        { terms: ["voice agent", "conversational AI"], weight: 5 },
      ],
      includeContract: false,
      includeIntern: false,
      includeParttime: false,
      includeRemote: true,
      isPreferEntry: -1,
      locations: [],
      postingRecency: null,
      remoteOnly: false,
      roleTitles: ["Head of Engineering"],
      searchIntentSummary: "test",
    },
    searchMode: "strict",
    userId: "00000000-0000-4000-8000-000000000001",
  });

  const materializedBoundary = sql.indexOf("),\ncandidates AS");
  const ftsJoin = sql.indexOf("JOIN fts\n    ON tc.opportunity_search_tsv @@");

  assert.ok(ftsJoin > materializedBoundary);
  assert.match(sql, /title_candidates AS MATERIALIZED[\s\S]*cr\.seniority_level/);
  assert.match(
    sql,
    /cr\.source_type = 'external'[\s\S]*cw\.external_roles_enabled = true/
  );
  assert.doesNotMatch(
    sql.slice(0, materializedBoundary),
    /cr\.description|cr\.summary|cw\.company_description/
  );
  assert.match(sql, /FROM ranked_candidates ranked[\s\S]*JOIN public\.company_roles/);
});

test("SQL timeout retry context is appended after the cacheable prompt", async () => {
  process.env.OPENAI_API_KEY ??= "test-openai-key";
  const { appendRoleSqlTimeoutRetryContext } = await import(
    "@/lib/talentOnboarding/jobPostingRecommendations"
  );
  const originalPrompt = '{"request":"backend roles"}';
  const previousSql = "SELECT role_id FROM company_roles";
  const retryPrompt = appendRoleSqlTimeoutRetryContext(
    originalPrompt,
    previousSql
  );

  assert.equal(
    retryPrompt,
    [
      originalPrompt,
      "",
      "[이전 SQL]",
      previousSql,
      "",
      "위 쿼리의 범위가 너무 넓어서 timeout이 발생했다. 어느정도 더 좁혀서 작성해라.",
    ].join("\n")
  );
});
