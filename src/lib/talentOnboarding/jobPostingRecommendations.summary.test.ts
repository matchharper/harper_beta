import assert from "node:assert/strict";
import test from "node:test";

test("short and mixed-language summaries are persisted with their requested locale", async () => {
  process.env.OPENAI_API_KEY ??= "test-openai-key";
  const { persistRecommendations } = await import("./jobPostingRecommendations");
  const roleId = "00000000-0000-4000-8000-000000000001";
  for (const [outputLanguage, locale, content] of [
    ["English", "en", "Build developer tools."],
    ["Korean", "ko", "TypeScript, PostgreSQL, Kubernetes 기반 API 개발"],
  ]) {
    const sql: string[] = [];
    const rows: Array<{ fit_summary: string }> = [];
    const admin = {
      rpc: async (_name: string, args: { sql_query: string }) => {
        sql.push(args.sql_query);
        return { data: null, error: null };
      },
      from: (table: string) => {
        assert.equal(table, "talent_opportunity_recommendation");
        return { insert: (input: typeof rows) => {
          rows.push(...input);
          return { select: async () => ({ data: [{ id: "recommendation", role_id: roleId }], error: null }) };
        } };
      },
    };
    const result = await persistRecommendations({
      admin: admin as unknown as Parameters<typeof persistRecommendations>[0]["admin"],
      outputLanguage, userId: "fixture-user",
      recommendations: [{
        concerns: [], goodPoints: [], isSupplemental: false, recommendationId: null,
        recommendationText: content, roleId, score: 8,
        role: { role_id: roleId, role_name: "Engineer", description: "Developer tooling" },
        detail: { fitReasons: [], roleOverviewText: content, tradeoffs: [] },
      }],
    });
    assert.equal(sql.length, 1);
    assert.ok(sql[0].includes(content));
    assert.ok(sql[0].includes(`ARRAY['${locale}'::text]`));
    assert.ok(sql[0].includes("sourceHash"));
    assert.equal(rows[0].fit_summary, content);
    assert.equal(result[0].recommendationId, "recommendation");
  }
});
