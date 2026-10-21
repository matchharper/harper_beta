// Local-only aggregate verification, using the production query with synthetic rows.
// node --import tsx scripts/testCompanyLandingStats.mjs
// Set PGLITE_MODULE_PATH when PGlite is installed in an isolated local runtime.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  readCompanyLandingStats,
  readCompanyLandingPairStats,
} = require("../src/lib/companyLandingStats.server.ts");
const {
  COMPANY_LANDING_ACTIVITY_WINDOW_SECONDS,
  combineCompanyLandingStats,
  projectCompanyLandingPairCount,
} = require("../src/lib/companyLandingStats.ts");
const { PGlite } = await import(
  process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite"
);
const db = new PGlite();
const adapter = {
  begin: (_mode, callback) =>
    db.transaction((tx) =>
      callback(async (strings, ...values) => {
        const sql = strings.reduce(
          (query, part, index) => query + (index ? `$${index}` : "") + part,
          ""
        );
        return (await tx.query(sql, values)).rows;
      })
    ),
};
try {
  await db.exec(`
    create table talent_users (user_id text primary key);
    create table talent_setting (user_id text primary key, is_onboarding_done boolean);
    create table talent_messages (user_id text, role text, message_type text, content text);
    create table company_roles (role_id text primary key, source_type text, information jsonb);
    create table talent_external_fit (talent_id text, role_id text, created_at timestamptz default now(), unique(talent_id, role_id));
    create table talent_opportunity_fit (talent_id text, opportunity_id text, created_at timestamptz default now(), unique(talent_id, opportunity_id));
  `);
  const empty = await readCompanyLandingStats(adapter);
  assert.equal(empty.talentCount, 0);
  assert.equal(empty.averageConversationMessages, null);
  assert.equal(empty.assessedPairCount, 0);
  assert.equal((await readCompanyLandingPairStats(adapter)).assessedPairCount, 0);

  await db.exec(`
    insert into talent_users values ('a'), ('b'), ('registered-only'), ('one-way'), ('no-setting');
    insert into talent_setting values ('a', true), ('b', false), ('registered-only', null), ('one-way', true);
    insert into company_roles values ('one', 'external', '{}'), ('two', 'internal', '{}'),
      ('fixture', 'internal', '{"testOnly":true,"testFixture":"company-landing-stats"}');
    insert into talent_external_fit (talent_id, role_id) values ('a','one'), ('b','one'), ('a','fixture');
    insert into talent_opportunity_fit (talent_id, opportunity_id) values ('a','one'), ('a','two'), ('b','fixture');
    insert into talent_messages values
      ('a','user','chat','hello'), ('a','assistant','chat','hello'),
      ('a','user','chat','question'), ('a','assistant','chat','answer'),
      ('a','assistant','chat','more detail'),
      ('a','user','call_transcript','voice question'),
      ('a','assistant','call_transcript','voice answer'),
      ('b','user','chat','question'), ('b','assistant','chat','answer'),
      ('b','assistant','chat','more detail'),
      ('registered-only','user','chat','unfinished onboarding'),
      ('registered-only','assistant','chat','onboarding question'),
      ('no-setting','user','call_transcript','voice question'),
      ('no-setting','assistant','call_transcript','voice answer'),
      ('one-way','assistant','chat','greeting'),
      ('one-way','user','chat','   '),
      ('a','assistant','opportunity_agent_update','automatic notification'),
      ('a','user','opportunity_feedback_note','saved a job'),
      ('a','assistant','opportunity_feedback_note','not a candidate action'),
      ('a','user','opportunity_feedback_note','   '),
      ('one-way','user','opportunity_feedback_note','excluded a job'),
      ('a','assistant','system','system notification'),
      ('b','assistant','mail','email');
  `);
  const result = await readCompanyLandingStats(adapter);
  assert.equal(
    result.talentCount,
    5,
    "all registered talent, including people without chats"
  );
  assert.equal(
    result.averageConversationMessages,
    8,
    "only completed onboardings count; include chat, voice and feedback, exclude false/null/missing completion and one-way conversations"
  );
  await db.exec("update talent_setting set is_onboarding_done = true where user_id = 'b'");
  assert.equal(
    (await readCompanyLandingStats(adapter)).averageConversationMessages,
    6,
    "completing onboarding includes that person's full message history: round((8 + 3) / 2)"
  );
  await db.exec("update talent_setting set is_onboarding_done = false where user_id in ('a', 'b')");
  assert.equal(
    (await readCompanyLandingStats(adapter)).averageConversationMessages,
    null,
    "no completed two-way participants produces no average, not zero"
  );
  assert.equal(
    result.assessedPairCount,
    3,
    "deduplicate across fit tables and exclude marked fixtures"
  );
  assert.ok(Number.isFinite(Date.parse(result.updatedAt)));
  const frequent = await readCompanyLandingPairStats(adapter);
  assert.equal(
    frequent.assessedPairCount,
    result.assessedPairCount,
    "frequent and daily snapshots use the same deduplication and fixture exclusions"
  );
  assert.deepEqual(Object.keys(frequent).sort(), ["assessedPairCount", "recentAssessmentsPerSecond", "updatedAt"]);
  assert.equal(frequent.recentAssessmentsPerSecond, 3 / COMPANY_LANDING_ACTIVITY_WINDOW_SECONDS,
    "recent activity deduplicates pairs and excludes fixture roles");
  await db.exec("update talent_external_fit set created_at = now() - interval '8 days' where talent_id = 'b'");
  await db.exec("update talent_opportunity_fit set created_at = now() + interval '1 day' where opportunity_id = 'two'");
  assert.equal((await readCompanyLandingPairStats(adapter)).recentAssessmentsPerSecond,
    1 / COMPANY_LANDING_ACTIVITY_WINDOW_SECONDS, "old and future timestamps do not seed the pace");
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      "assessedPairCount",
      "averageConversationMessages",
      "talentCount",
      "updatedAt",
    ],
    "only aggregate fields are returned"
  );
  const baseline = {
    ...result,
    assessedPairCount: 1000,
    updatedAt: "2026-10-20T00:00:00Z",
  };
  const stats = combineCompanyLandingStats(baseline, {
    assessedPairCount: 1060,
    updatedAt: "2026-10-20T00:05:00Z",
  });
  assert.equal(stats.assessedPairsPerSecond, 0.2);
  assert.equal(
    projectCompanyLandingPairCount(stats, Date.parse("2026-10-20T00:08:00Z")),
    1096,
    "projection follows measured net growth"
  );
  assert.equal(
    projectCompanyLandingPairCount(stats, Date.parse("2026-10-20T01:00:00Z")),
    1180,
    "stale data cannot keep growing beyond ten minutes"
  );
  assert.equal(
    projectCompanyLandingPairCount(stats, Date.parse("2026-10-19T23:00:00Z")),
    1060,
    "a client clock behind the snapshot never subtracts from the actual count"
  );
  assert.equal(
    combineCompanyLandingStats(baseline, baseline).assessedPairsPerSecond,
    0,
    "one snapshot is not enough to invent a growth rate"
  );
  assert.equal(
    combineCompanyLandingStats(baseline, {
      assessedPairCount: 1020,
      updatedAt: "2026-10-20T00:00:01Z",
    }).assessedPairsPerSecond,
    0,
    "near-simultaneous snapshots do not amplify a short burst"
  );
  const cold = combineCompanyLandingStats(baseline, { ...baseline, recentAssessmentsPerSecond: 1.5 });
  assert.equal(cold.assessedPairsPerSecond, 1.5, "cold cache starts from recent activity without waiting five minutes");
  assert.equal(projectCompanyLandingPairCount(cold, Date.parse("2026-10-20T00:00:02Z")), 1003);
  const warm = combineCompanyLandingStats(baseline, {
    assessedPairCount: 1060, updatedAt: "2026-10-20T00:05:00Z", recentAssessmentsPerSecond: 1.5,
  });
  assert.equal(warm.assessedPairsPerSecond, 0.2, "measured net growth supersedes the startup estimate");
  const rollover = combineCompanyLandingStats(
    { ...baseline, updatedAt: "2026-10-20T00:10:00Z" },
    { ...baseline, recentAssessmentsPerSecond: 1.5 }
  );
  assert.equal(rollover.assessedPairsPerSecond, 1.5, "daily refresh must not reset pacing to zero");
  const decreased = combineCompanyLandingStats(baseline, {
    assessedPairCount: 980,
    updatedAt: "2026-10-20T00:05:00Z",
  });
  assert.equal(decreased.assessedPairCount, 980);
  assert.equal(decreased.assessedPairsPerSecond, 0);
  const refreshedDaily = combineCompanyLandingStats(
    { ...baseline, assessedPairCount: 1100, updatedAt: "2026-10-20T00:10:00Z" },
    { assessedPairCount: 1060, updatedAt: "2026-10-20T00:05:00Z" }
  );
  assert.equal(refreshedDaily.assessedPairCount, 1100);
  assert.equal(refreshedDaily.assessedPairsPerSecond, 0);
  assert.equal(
    projectCompanyLandingPairCount(baseline, Date.parse("2026-10-20T00:08:00Z")),
    1000,
    "an older cached API response remains a valid static count"
  );
  console.log(
    "PASS: onboarding-completed population, full chat/voice/feedback history, empty eligible population, daily/frequent aggregate parity, pair deduplication, fixture exclusion, measured growth, projection cap, clock skew, cold cache, corrections, older API compatibility"
  );
} finally {
  await db.close();
}
