import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { ACTIVITY_WEEKDAYS, latestObservedWeekday, weeklyActivityChartPoints } from "./talentMetricsPresentation";
import type { OpsTalentMetricsConversionResponse, OpsTalentMetricsEngagementResponse } from "./talentMetrics";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table talent_users(user_id uuid, email text, created_at timestamptz, deleted_at timestamptz);
    create table company_roles(role_id uuid, source_type text, information jsonb);
    create table talent_setting(user_id uuid, updated_at timestamptz, is_onboarding_done boolean, get_internal_recommendation boolean, profile_visibility text);
    create table talent_activity_events(talent_id uuid, created_at timestamptz, event_type text);
    create table talent_progress(talent_id uuid, role_id uuid, kind text, metadata jsonb, created_at timestamptz);
    create table talent_opportunity_tag(talent_id uuid, opportunity_id uuid, tag text, updated_at timestamptz);
    create table talent_opportunity_recommendation(id uuid default gen_random_uuid(), talent_id uuid, role_id uuid,
      feedback text, feedback_at timestamptz, updated_at timestamptz, recommended_at timestamptz, viewed_at timestamptz, clicked_at timestamptz);
    create table talent_messages(user_id uuid, role text, content text, created_at timestamptz);
    create table logs(user_id uuid, type text, created_at timestamptz);
    insert into company_roles values ('${id(101)}','internal','{}'), ('${id(102)}','external','{}'),
      ('${id(103)}','external','{}'), ('${id(104)}','internal','{"testOnly":true}');
    insert into talent_users select
      ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      case n when 5 then 'team@matchharper.com' when 7 then 'exclude@example.com' else n||'@example.com' end,
      '2026-01-01'::timestamptz, case when n=6 then '2026-10-01'::timestamptz end
      from generate_series(1,9) n;
    insert into talent_messages values
      ('${id(1)}','user','Sunday KST','2026-10-11 14:59:59Z'),
      ('${id(1)}','user','Monday KST','2026-10-11 15:00:00Z'),
      ('${id(1)}','user','Repeat Monday','2026-10-12 01:00:00Z'),
      ('${id(1)}','user','Repeat Tuesday','2026-10-13 01:00:00Z'),
      ('${id(3)}','user','Thursday KST','2026-10-14 16:00:00Z'),
      ('${id(4)}','user','Friday','2026-10-16 00:00:00Z'),
      ('${id(9)}','assistant','Not a human action','2026-10-12 00:00:00Z');
    insert into logs values
      ('${id(2)}','login_completed','2026-10-05 00:00:00Z'),
      ('${id(2)}','login_completed','2026-10-13 00:00:00Z'),
      ('${id(9)}','career_tool_call:read_profile','2026-10-12 00:00:00Z'),
      ('${id(5)}','login_completed','2026-10-12 00:00:00Z'),
      ('${id(6)}','login_completed','2026-10-12 00:00:00Z'),
      ('${id(7)}','login_completed','2026-10-12 00:00:00Z');
    insert into talent_opportunity_recommendation(talent_id,role_id,feedback,feedback_at,updated_at,recommended_at,viewed_at) values
      ('${id(1)}','${id(101)}','like','2026-10-12 01:00Z','2026-10-12 01:00Z','2026-10-10',null),
      ('${id(1)}','${id(102)}','dislike','2026-10-13 01:00Z','2026-10-13 01:00Z','2026-10-10',null),
      ('${id(1)}','${id(103)}','positive','2026-10-13 02:00Z','2026-10-13 02:00Z','2026-10-10',null),
      ('${id(2)}','${id(101)}','negative','2026-10-15 00:00Z','2026-10-15 00:00Z','2026-10-10','2026-10-14 00:00Z'),
      ('${id(3)}','${id(101)}',null,null,'2026-10-15','2026-10-10','2026-10-15 00:00Z'),
      ('${id(5)}','${id(101)}','like','2026-10-15',null,'2026-10-10',null),
      ('${id(6)}','${id(101)}','like','2026-10-15',null,'2026-10-10',null),
      ('${id(7)}','${id(101)}','like','2026-10-15',null,'2026-10-10',null),
      ('${id(8)}','${id(104)}','like','2026-10-15',null,'2026-10-10','2026-10-13');
  `);
  await db.exec(await readFile(new URL("../../../supabase/migrations/20261113064102_ops_metrics_feedback_and_weekday_activity.sql", import.meta.url), "utf8"));
  return db;
}

test("feedback people are deduplicated within each selected day/week/month, retaining source exclusions", async () => {
  const db = await fixture();
  try {
    for (const interval of ["day", "week", "month"]) {
      const result = (await db.query<{ data: OpsTalentMetricsConversionResponse }>(
        "select get_ops_talent_metrics_conversion_v1('2026-10-12','2026-10-15',$1,array['exclude@']) data", [interval])).rows[0].data;
      assert.equal(result.summary.recommendationFeedbackTalentCount, 2);
      assert.equal(result.summary.recommendationAcceptedCount, 2);
      assert.equal(result.summary.recommendationRejectedCount, 2);
      assert.equal(result.comparison.recommendationFeedbackTalentCount, 0);
      assert.deepEqual(result.trend.map(p => p.recommendationFeedbackTalentCount), interval === "day" ? [1, 1, 0, 1] : [2]);
    }
    // A later recommendation for the same Role must not erase participation in an earlier week.
    await db.query(`insert into talent_opportunity_recommendation(talent_id,role_id,feedback,feedback_at,updated_at,recommended_at)
      values ($1,$2,'like','2026-10-05','2026-10-05','2026-10-04')`, [id(1),id(101)]);
    const history = (await db.query<{ data: OpsTalentMetricsConversionResponse }>(
      "select get_ops_talent_metrics_conversion_v1('2026-10-05','2026-10-18','week',array['exclude@']) data")).rows[0].data;
    assert.deepEqual(history.trend.map(p => p.recommendationFeedbackTalentCount), [1,2]);
    assert.equal(history.summary.recommendationFeedbackTalentCount, 2);
    const grants = (await db.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated','get_ops_talent_metrics_conversion_v1(date,date,text,text[])','execute') allowed")).rows[0];
    assert.equal(grants.allowed, false);
  } finally { await db.close(); }
});

test("weekday WAU counts each person on their first KST activity day; partial weeks have no future zeros", async () => {
  const db = await fixture();
  try {
    const read = async (from: string, to: string) => (await db.query<{ data: OpsTalentMetricsEngagementResponse }>(
      "select get_ops_talent_metrics_engagement_v1($1::date,$2::date,'week',array['exclude@']) data", [from,to])).rows[0].data;
    const partial = await read("2026-10-05", "2026-10-15");
    const [previous, current] = partial.retention;
    assert.deepEqual(previous.weekdayCumulativeActiveTalentCounts, [1,1,1,1,1,1,2]);
    assert.deepEqual(current.weekdayCumulativeActiveTalentCounts, [1,2,2,3,null,null,null]);
    assert.equal(current.activeTalentCount, 3);
    assert.equal(latestObservedWeekday(partial.retention), 3);
    const bars = weeklyActivityChartPoints(partial.retention, 3);
    assert.deepEqual(ACTIVITY_WEEKDAYS.map(d => bars[1][d.key]), [1,1,0,1,null,null,null]);
    assert.equal(ACTIVITY_WEEKDAYS.reduce((sum,d) => sum + (bars[1][d.key] ?? 0), 0), 3);
    assert.equal(ACTIVITY_WEEKDAYS.reduce((sum,d) => sum + (bars[0][d.key] ?? 0), 0), 1);
    const complete = (await read("2026-10-12", "2026-10-18")).retention[0];
    assert.deepEqual(complete.weekdayCumulativeActiveTalentCounts, [1,2,2,3,4,4,4]);
    assert.equal(complete.activeTalentCount, 4);
    // A date filter starting midweek still represents that calendar week's WAU.
    assert.deepEqual((await read("2026-10-13", "2026-10-15")).retention[0].weekdayCumulativeActiveTalentCounts,
      current.weekdayCumulativeActiveTalentCounts);
    const empty = await read("2026-09-21", "2026-09-27");
    assert.deepEqual(empty.retention[0].weekdayCumulativeActiveTalentCounts, [0,0,0,0,0,0,0]);
    assert.equal((await db.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated','get_ops_talent_metrics_engagement_v1(date,date,text,text[])','execute') allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
