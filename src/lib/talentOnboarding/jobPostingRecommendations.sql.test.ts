import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

test("role search materializes only ranking fields before FTS", async () => {
  process.env.OPENAI_API_KEY ??= "test-openai-key";
  const { buildRoleSearchSql } =
    await import("@/lib/talentOnboarding/jobPostingRecommendations");
  const sql = buildRoleSearchSql({
    blockedCompanies: [],
    plan: {
      ftsKeywords: [{ terms: ["voice agent", "conversational AI"], weight: 5 }],
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
  assert.match(
    sql,
    /title_candidates AS MATERIALIZED[\s\S]*cr\.seniority_level/
  );
  assert.match(
    sql,
    /cr\.source_type = 'external'[\s\S]*cw\.external_roles_enabled = true/
  );
  assert.match(
    sql,
    /COALESCE\(cr\.source_provider, ''\) <> 'user_submitted'/
  );
  assert.doesNotMatch(
    sql.slice(0, materializedBoundary),
    /cr\.description|cr\.summary|cw\.company_description/
  );
  assert.match(
    sql,
    /FROM ranked_candidates ranked[\s\S]*JOIN public\.company_roles/
  );
});

test("role SQL retries the identical query once only after a timeout", async (t) => {
  process.env.OPENAI_API_KEY ??= "test-openai-key";
  const { executePreparedRoleSql } =
    await import("@/lib/talentOnboarding/jobPostingRecommendations");
  const sql = "SELECT role_id FROM public.company_roles LIMIT 200";
  const timeout = { code: "57014", message: "canceling statement due to statement timeout" };
  const syntaxError = { code: "42601", message: "syntax error" };
  const row = { role_id: "00000000-0000-4000-8000-000000000001" };

  for (const scenario of [
    { name: "success needs no retry", errors: [null], expectedCalls: 1 },
    { name: "timeout then success", errors: [timeout, null], expectedCalls: 2 },
    { name: "two timeouts propagate the second error", errors: [timeout, timeout], expectedCalls: 2, failure: timeout },
    { name: "retry failure keeps its own error", errors: [timeout, syntaxError], expectedCalls: 2, failure: syntaxError },
    { name: "other errors are not retried", errors: [syntaxError], expectedCalls: 1, failure: syntaxError },
    { name: "cancellation prevents retry", errors: [timeout], expectedCalls: 1, abort: true },
  ]) {
    await t.test(scenario.name, async () => {
      const calls: unknown[] = [];
      const failures: Array<{ meta_data: { sql: string } }> = [];
      const controller = new AbortController();
      const admin = {
        rpc: (name: string, params: unknown) => {
          calls.push({ name, params });
          const error = scenario.errors[calls.length - 1];
          assert.notEqual(error, undefined, "unexpected extra SQL call");
          if (scenario.abort) controller.abort();
          return { abortSignal: () => Promise.resolve({ data: error ? null : [row], error }) };
        },
        from: (table: string) => {
          assert.equal(table, "logs");
          return { insert: async (entry: { meta_data: { sql: string } }) => {
            failures.push(entry);
            return { error: null };
          } };
        },
      };
      const result = executePreparedRoleSql({
        admin: admin as unknown as Parameters<typeof executePreparedRoleSql>[0]["admin"],
        abortSignal: controller.signal,
        searchMode: "strict",
        sql,
        userId: row.role_id,
      });
      if (scenario.abort) {
        await assert.rejects(result, { name: "AbortError" });
      } else if (scenario.failure) {
        await assert.rejects(result, {
          name: "RoleSqlExecutionError",
          sql,
          message: `[strict role sql] ${scenario.failure.message}`,
          timedOut: scenario.failure === timeout,
        });
      } else {
        assert.equal((await result).rows[0].role_id, row.role_id);
      }
      assert.deepEqual(calls, Array.from({ length: scenario.expectedCalls }, () => ({
        name: "search_external_roles_filter_first", params: { p_sql: sql },
      })));
      assert.equal(failures.length, scenario.errors.filter(Boolean).length);
      assert.ok(failures.every((entry) => entry.meta_data.sql === sql));
    });
  }
});

test("full-JD fit cache changes with the actual user and search context", async () => {
  process.env.OPENAI_API_KEY ??= "test-openai-key";
  const { fullJdCacheInputFingerprint } =
    await import("@/lib/talentOnboarding/jobPostingRecommendations");
  const plan = {
    ftsKeywords: [{ terms: ["inference infrastructure"], weight: 5 }],
    includeContract: false,
    includeIntern: false,
    includeParttime: false,
    includeRemote: true,
    isPreferEntry: -1 as const,
    locations: ["Seoul"],
    postingRecency: null,
    remoteOnly: false,
    roleTitles: ["ML Infrastructure Engineer"],
    searchIntentSummary: "Infrastructure roles",
  };
  const original = fullJdCacheInputFingerprint({
    fitContextText: "Search Brief\n[1] Location: Seoul or remote",
    plan,
  });

  assert.notEqual(
    original,
    fullJdCacheInputFingerprint({
      fitContextText: "Search Brief\n[1] Location: New York",
      plan,
    })
  );
  assert.notEqual(
    original,
    fullJdCacheInputFingerprint({
      fitContextText: "Search Brief\n[1] Location: Seoul or remote",
      plan: { ...plan, searchIntentSummary: "Research roles" },
    })
  );
});

test("full-JD fit reuses legacy evaluator hashes without ignoring changed evidence", async () => {
  process.env.OPENAI_API_KEY ??= "test-openai-key";
  const { fullJdCacheInputFingerprint, fullJdCacheInputMatches } =
    await import("@/lib/talentOnboarding/jobPostingRecommendations");
  const input = {
    fitContextText: "Search Brief: Seoul or remote",
    plan: {
      ftsKeywords: [{ terms: ["inference infrastructure"], weight: 5 }],
      includeContract: false, includeIntern: false, includeParttime: false,
      includeRemote: true, isPreferEntry: -1 as const, locations: ["Seoul"],
      postingRecency: null, remoteOnly: false,
      roleTitles: ["ML Infrastructure Engineer"], searchIntentSummary: "Infrastructure roles",
    },
  };
  const stableUserContext = [input.fitContextText, "[NORMALIZED SEARCH INTENT]",
    input.plan.searchIntentSummary, "[SEARCH ROLE TITLES]", input.plan.roleTitles.join(", "),
    "[SEARCH DOMAIN TERMS]", "inference infrastructure"].join("\n");
  const canonicalHash = createHash("sha256").update(JSON.stringify({ stableUserContext })).digest("hex");
  assert.equal(fullJdCacheInputFingerprint(input), canonicalHash);
  assert.ok(fullJdCacheInputMatches({ inputFingerprint: canonicalHash }, input));
  for (const evaluatorKey of ["beta-full-jd-v1", "another-provider-future-version"]) {
    const inputFingerprint = createHash("sha256")
      .update(JSON.stringify({ evaluatorKey, stableUserContext })).digest("hex");
    const meta = { evaluatorKey, inputFingerprint };
    assert.ok(fullJdCacheInputMatches(meta, input));
    assert.equal(fullJdCacheInputMatches(meta, { ...input, fitContextText: "Tokyo only" }), false);
    assert.equal(fullJdCacheInputMatches(meta, {
      ...input, plan: { ...input.plan, searchIntentSummary: "Research roles" },
    }), false);
  }
  assert.equal(fullJdCacheInputMatches({}, input), false);
});
