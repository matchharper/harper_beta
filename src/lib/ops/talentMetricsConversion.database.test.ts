import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { OpsTalentMetricsConversionResponse } from "./talentMetrics";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = (name: string) =>
  readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
const close = (actual: number | null | undefined, expected: number) =>
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test("conversion v2 counts every signup and internal recommendation, including those under 14 days old", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table talent_users(user_id uuid, email text, created_at timestamptz, deleted_at timestamptz);
      create table company_roles(role_id uuid, source_type text, information jsonb);
      create table talent_setting(user_id uuid, updated_at timestamptz, is_onboarding_done boolean, get_internal_recommendation boolean, profile_visibility text);
      create table talent_activity_events(talent_id uuid, created_at timestamptz, event_type text);
      create table talent_progress(talent_id uuid, role_id uuid, kind text, metadata jsonb, created_at timestamptz);
      create table talent_opportunity_tag(talent_id uuid, opportunity_id uuid, tag text, updated_at timestamptz);
      create table talent_opportunity_recommendation(id uuid default gen_random_uuid(), talent_id uuid, role_id uuid,
        feedback text, feedback_at timestamptz, updated_at timestamptz, recommended_at timestamptz);
      insert into company_roles values ('${id(101)}', 'internal', '{}');
      -- 1 signed up 20 days ago, 2 and 3 within the last 2 days. 1 and 2 finished onboarding a day / an hour after.
      insert into talent_users values
        ('${id(1)}', '1@example.com', now() - interval '20 days', null),
        ('${id(2)}', '2@example.com', now() - interval '2 days', null),
        ('${id(3)}', '3@example.com', now() - interval '1 day', null);
      insert into talent_setting values
        ('${id(1)}', now() - interval '19 days', true, true, 'share'),
        ('${id(2)}', now() - interval '2 days' + interval '1 hour', true, true, 'share');
      -- Both internal recommendations are under 14 days old; 1 accepted theirs.
      insert into talent_opportunity_recommendation(talent_id, role_id, feedback, feedback_at, updated_at, recommended_at) values
        ('${id(1)}', '${id(101)}', 'like', now() - interval '2 days', now() - interval '2 days', now() - interval '3 days'),
        ('${id(2)}', '${id(101)}', null, null, now() - interval '1 day', now() - interval '1 day');
    `);
    await db.exec(await migration("20261113064102_ops_metrics_feedback_and_weekday_activity.sql"));
    await db.exec(await migration("20261123100000_ops_conversion_metrics_v2_all_signups.sql"));

    const read = async (version: "v1" | "v2") =>
      (
        await db.query<{ data: OpsTalentMetricsConversionResponse }>(
          `select get_ops_talent_metrics_conversion_${version}(
             (now() at time zone 'Asia/Seoul')::date - 30, (now() at time zone 'Asia/Seoul')::date, 'week', '{}'
           ) data`
        )
      ).rows[0].data;

    const v2 = await read("v2");
    assert.equal(v2.summary.onboardingSignupCount, 3);
    assert.equal(v2.summary.onboardingCompletedWithin14DaysCount, 2);
    close(v2.summary.onboardingCompletionRate, 2 / 3);
    assert.equal(v2.summary.internalRecommendationPairCount, 2);
    assert.equal(v2.summary.internalAcceptedCount, 1);
    close(v2.summary.internalAcceptanceRate, 1 / 2);
    const completedInTrend = v2.trend.filter((point) => point.onboardingCompletionRate !== null);
    assert.ok(completedInTrend.length > 0);

    // v1 keeps only those whose 14 days have passed: one signup, no recommendation.
    const v1 = await read("v1");
    close(v1.summary.onboardingCompletionRate, 1);
    assert.equal(v1.summary.internalAcceptanceRate, null);

    const grants = (
      await db.query<{ allowed: boolean }>(
        "select has_function_privilege('authenticated','get_ops_talent_metrics_conversion_v2(date,date,text,text[])','execute') allowed"
      )
    ).rows[0];
    assert.equal(grants.allowed, false);
  } finally {
    await db.close();
  }
});
