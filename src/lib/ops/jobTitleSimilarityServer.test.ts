import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import {
  jobTitleSimilarityRequestSchema,
  type JobTitleSimilarityResult as SearchResult,
  type JobTitleSimilarityRow,
} from "./jobTitleSimilarity";

type JobTitleSimilarityResult = Omit<SearchResult, "rows"> & {
  rows: JobTitleSimilarityRow[];
};

test("role search reranks eligible roles without a title dictionary", async () => {
  // All data stays in this in-memory database; no model or Supabase calls.
  process.env.OPENAI_API_KEY ??= "local-check-only";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "local-check-only";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "local-check-only";
  const { buildJobTitleSimilaritySql } =
    await import("./jobTitleSimilarityServer");
  const { flattenRpcRows } =
    await import("../talentOnboarding/jobPostingRecommendations");
  const db = new PGlite({ extensions: { vector } });
  const embedding = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  try {
    await db.exec(`CREATE EXTENSION vector;
      CREATE TABLE company_roles (role_id text, name text, company_workspace_id text, source_type text, is_expired boolean, expires_at timestamptz, status text, source_provider text, information jsonb, title_embedding vector(1536), title_embedding_text text);
      CREATE TABLE company_workspace (company_workspace_id text, company_name text);
      INSERT INTO company_roles SELECT n::text, 'Engineer', 'company', 'external', false, NULL, 'active', 'fixture', '{}'::jsonb, NULL, 'Engineer' FROM generate_series(1, 3) n;
      INSERT INTO company_workspace VALUES ('company', 'Local fixture');`);
    await db.query("UPDATE company_roles SET title_embedding = $1::vector", [
      JSON.stringify(embedding),
    ]);
    const query = async (sql: string) => {
      // Match the production RPC's JSON wrapping and server unwrapping.
      const response = await db.query<{ result: JobTitleSimilarityResult }>(
        `SELECT to_jsonb(result) AS result FROM (${sql}) result`
      );
      const [result] = flattenRpcRows(
        response.rows.map((row) => row.result)
      ) as JobTitleSimilarityResult[];
      assert.ok(Number.isFinite(result.timings.candidateSearchMs));
      assert.ok(Number.isFinite(result.timings.rerankAndFetchMs));
      assert.ok(result.timings.candidateSearchMs >= 0);
      assert.ok(result.timings.rerankAndFetchMs >= 0);
      return result;
    };
    for (const [limit, expected] of [
      [1, 1],
      [2, 2],
      [1000, 3],
      [undefined, 3],
    ] as const) {
      const result = await query(buildJobTitleSimilaritySql(embedding, limit));
      assert.equal(result.rows.length, expected);
      assert.deepEqual(
        result.rows.map((row) => row.role_id),
        ["1", "2", "3"].slice(0, expected)
      );
      assert.equal(result.rows[0].similarity, 1);
    }

    assert.equal(
      jobTitleSimilarityRequestSchema.parse({ text: "Engineer" })
        .candidateLimit,
      1000
    );
    assert.equal(
      jobTitleSimilarityRequestSchema.parse({
        text: "Engineer",
        candidateLimit: 5000,
      }).candidateLimit,
      5000
    );
    for (const candidateLimit of [
      0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      "5000; SELECT 1",
    ]) {
      assert.equal(
        jobTitleSimilarityRequestSchema.safeParse({
          text: "Engineer",
          candidateLimit,
        }).success,
        false
      );
    }
    assert.throws(() => buildJobTitleSimilaritySql(embedding, 20, 1.5));

    // Candidate count now limits roles even when several roles share a title.
    const otherEmbedding = [...embedding];
    otherEmbedding[1] = 1;
    await db.query(
      "INSERT INTO company_roles VALUES ('4', 'Other Engineer', 'company', 'external', false, NULL, 'active', 'fixture', '{}'::jsonb, $1::vector, 'Other Engineer')",
      [JSON.stringify(otherEmbedding)]
    );
    assert.equal(
      (await query(buildJobTitleSimilaritySql(embedding, 20, 1))).rows.length,
      1
    );
    assert.equal(
      (await query(buildJobTitleSimilaritySql(embedding, 20, 5000))).rows
        .length,
      4
    );
    assert.equal(
      (await query(buildJobTitleSimilaritySql(embedding, 2, 5000))).rows.length,
      2
    );
    await db.exec("DELETE FROM company_roles WHERE role_id = '4';");

    // All eligibility checks happen before the candidate limit. Missing/stale
    // embeddings must not silently borrow a vector from another role's title.
    await db.exec(`INSERT INTO company_roles
      SELECT 'excluded-' || n, name, company_workspace_id, source_type, is_expired,
        expires_at, status, source_provider, information, title_embedding, title_embedding_text
      FROM company_roles CROSS JOIN generate_series(1, 7) n WHERE role_id = '1';
      UPDATE company_roles SET title_embedding = NULL WHERE role_id = 'excluded-1';
      UPDATE company_roles SET title_embedding_text = 'Old title' WHERE role_id = 'excluded-2';
      UPDATE company_roles SET status = 'closed' WHERE role_id = 'excluded-3';
      UPDATE company_roles SET information = '{"testOnly":true}' WHERE role_id = 'excluded-4';
      UPDATE company_roles SET source_provider = 'user_submitted' WHERE role_id = 'excluded-5';
      UPDATE company_roles SET is_expired = true WHERE role_id = 'excluded-6';
      UPDATE company_roles SET expires_at = now() - interval '1 day' WHERE role_id = 'excluded-7';`);
    assert.deepEqual(
      (await query(buildJobTitleSimilaritySql(embedding, 20, 5000))).rows.map(
        (row) => row.role_id
      ),
      ["1", "2", "3"]
    );
    assert.ok(
      (await query(buildJobTitleSimilaritySql(embedding, 1, 1))).rows.every(
        (row) => ["1", "2", "3"].includes(row.role_id)
      )
    );

    // Delays inside each materialized stage must be charged to that stage.
    const delayed = buildJobTitleSimilaritySql(embedding, 2)
      .replace(
        "r.company_workspace_id, r.title_embedding",
        "r.company_workspace_id, r.title_embedding, pg_sleep(0.03) AS delay"
      )
      .replace("AS similarity\n", "AS similarity, pg_sleep(0.03) AS delay\n");
    const timed = await query(delayed);
    assert.ok(timed.timings.candidateSearchMs >= 25);
    assert.ok(timed.timings.rerankAndFetchMs >= 25);

    await db.exec("DELETE FROM company_roles;");
    assert.deepEqual(
      (await query(buildJobTitleSimilaritySql(embedding))).rows,
      []
    );
  } finally {
    await db.close();
  }
});
