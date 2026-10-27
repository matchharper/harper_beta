import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-key";

test("daily report queries preserve onboarding history and count included web application starts", async (t) => {
  const { supabaseServer } = await import("@/lib/supabaseServer");
  const { buildDailyUserStatsReport, formatDailyUserStatsSlackMessages } =
    await import("@/lib/dailyUserStats");
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
        } else if (table === "talent_simulate_application") {
          assert.ok(params.get("select")?.includes(
            "talent_messages!talent_simulate_application_start_offer_message_id_fkey!inner(message_type)"
          ));
          assert.equal(params.get("start_offer.message_type"), "eq.application_start_offer");
          assert.deepEqual(params.getAll("created_at"), [
            "gte.2026-10-10T15:00:00.000Z",
            "lt.2026-10-11T15:00:00.000Z",
          ]);
          assert.equal(params.has("status"), false, "ended sessions still count as starts");
          rows = ["recommended-user", "recommended-user", "missing-user", "test-user"]
            .map((user_id) => ({ user_id }));
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
  assert.equal(report.applicationStartCount, 3);
  assert.equal(report.applicationStartUserCount, 2);
  const rendered = formatDailyUserStatsSlackMessages({
    ...report,
    tools: [{ name: "simulate_application", callCount: 112, userCount: 41, failedCallCount: 2 }],
  });
  assert.ok(rendered.details.includes(
    "- simulate_application: 112 calls / 41 users / error 2\n  ↳ 함께 지원 시작하기 → 지원 모드 진입: 3건 / 2 users"
  ));
  assert.ok(formatDailyUserStatsSlackMessages(report).details.includes(
    "- 함께 지원 시작하기 → 지원 모드 진입: 3건 / 2 users"
  ), "starts from older cards remain visible without same-day tool calls");
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
