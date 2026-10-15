import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";

test("onboarding gaps query only included completers and retain historical recommendations", async (t) => {
  const { supabaseServer } = await import("@/lib/supabaseServer");
  const { buildDailyUserStatsReport } = await import("@/lib/dailyUserStats");
  const recommendationQueries: URL[] = [];
  let hasCompleters = true;
  const observationEnd = "2026-10-11T16:00:00.000Z";
  const historicalRecommendations = [
    ...Array.from({ length: 1_001 }, () => ({
      talent_id: "recommended-user",
      created_at: "2026-10-01T00:00:00.000Z",
    })),
    { talent_id: "missing-user", created_at: observationEnd },
    { talent_id: "unrelated-user", created_at: "2026-10-01T00:00:00.000Z" },
  ];
  const client = createClient("http://127.0.0.1:54321", "fixture-key", {
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1);
        const params = url.searchParams;
        let rows: unknown[] = [];
        if (table === "talent_users") {
          rows = [
            "recommended-user",
            "missing-user",
            "test-user",
            "unrelated-user",
          ].map((user_id) => ({
            user_id,
            email: `${user_id}@example.com`,
            created_at: "2026-10-10T16:00:00.000Z",
            last_logined_at: null,
          }));
        } else if (
          table === "logs" &&
          params.get("type") === "eq.analytics_excluded_test_fixture_talent"
        ) {
          rows = [{ user_id: "test-user" }];
        } else if (table === "talent_activity_events" && hasCompleters) {
          rows = ["recommended-user", "missing-user", "test-user"].map(
            (talent_id) => ({
              talent_id,
              event_type: "onboarding_completed",
              created_at: "2026-10-10T18:00:00.000Z",
            })
          );
        } else if (table === "talent_opportunity_recommendation") {
          recommendationQueries.push(url);
          if (params.get("select") === "talent_id") {
            const filter = params.get("talent_id");
            assert.ok(filter, "historical reads must have a talent filter");
            const ids = filter.slice(4, -1).split(",");
            assert.deepEqual(ids.sort(), ["missing-user", "recommended-user"]);
            assert.equal(params.get("created_at"), `lt.${observationEnd}`);
            rows = historicalRecommendations
              .filter(
                (row) =>
                  ids.includes(row.talent_id) && row.created_at < observationEnd
              )
              .map(({ talent_id }) => ({ talent_id }));
          }
        } else if (table === "talent_setting") {
          rows = [
            { user_id: "missing-user", get_external_recommendation: false },
          ];
        }
        const from = Number(params.get("offset") ?? 0);
        const size = Number(params.get("limit") ?? rows.length);
        return new Response(JSON.stringify(rows.slice(from, from + size)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  t.mock.method(supabaseServer, "from", client.from.bind(client));

  const report = await buildDailyUserStatsReport("2026-10-11");
  assert.equal(report.onboardingCompletedNoRecommendationUserCount, 1);
  assert.equal(
    report.onboardingCompletedNoRecommendationInternalOnlyUserCount,
    1
  );
  assert.equal(report.onboardingCompletedNoEmailUserCount, 2);
  const historicalQueries = recommendationQueries.filter(
    (url) => url.searchParams.get("select") === "talent_id"
  );
  assert.deepEqual(
    historicalQueries.map((url) => url.searchParams.get("offset")),
    ["0", "1000"]
  );

  hasCompleters = false;
  recommendationQueries.length = 0;
  const emptyReport = await buildDailyUserStatsReport("2026-10-11");
  assert.equal(emptyReport.onboardingCompletedNoRecommendationUserCount, 0);
  assert.equal(
    recommendationQueries.some(
      (url) => url.searchParams.get("select") === "talent_id"
    ),
    false
  );
});
