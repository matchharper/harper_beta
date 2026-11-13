import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readMigration(fileName: string) {
  return readFileSync(
    new URL(`../../../supabase/migrations/${fileName}`, import.meta.url),
    "utf8"
  );
}

// 전환 함수의 최신 정의와 활동·리텐션 함수의 최신 정의.
const conversionMigration = readMigration(
  "20261022123304_ops_metrics_internal_recommendation_count.sql"
);
const activityMigration = readMigration(
  "20261113014810_ops_talent_metrics_user_activity_only.sql"
);

const baseMigration = `${conversionMigration}\n${activityMigration}`;
const migration = baseMigration;
const sectionMigration = baseMigration;
// 권한 문장을 뺀 함수 본문. 섹션 함수가 이전 v1·v2 함수를 부르지 않는지 볼 때 쓴다.
const sectionFunctionBodies = sectionMigration
  .split("\n")
  .filter((line) => !/^\s*(revoke|grant)\s/i.test(line))
  .join("\n");

test("talent metrics aggregation remains service-role-only and test-isolated", () => {
  assert.match(migration, /security definer/i);
  assert.match(
    migration,
    /revoke all on function public\.get_ops_talent_metrics_v2[\s\S]*from public/i
  );
  assert.match(
    migration,
    /grant execute on function public\.get_ops_talent_metrics_v2[\s\S]*to service_role/i
  );
  assert.match(migration, /information\s*->>\s*'testOnly'/i);
  assert.match(migration, /matchharper\.com/i);
});

test("talent metrics response includes the north star and requested drivers", () => {
  for (const key of [
    "verifiedConnectionYieldPer100TalentQuarters",
    "interactionTalentCount",
    "dau",
    "wau",
    "retentionRate",
    "recommendationAcceptRejectRatio",
    "internalAcceptanceRate",
    "pendingConnectionTalentCount",
    "onboardingCompletionRate",
  ]) {
    assert.match(baseMigration, new RegExp(`'${key}'`));
  }
  assert.match(baseMigration, /'dailyActivity'/);
  assert.match(baseMigration, /interval '14 days'/i);
  assert.match(baseMigration, /interval '90 days'|\/\s*90\.0/i);

  for (const key of [
    "messageCount",
    "messageCharacterCount",
    "recommendationAcceptRejectRatio",
    "recommendationAcceptedCount",
    "recommendationRejectedCount",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(migration, /weeklyRetentionCohorts/);
  assert.match(migration, /public\.get_ops_talent_metrics_v1/i);
});

test("weekly retention uses signup cohorts and KST activity days", () => {
  assert.match(migration, /cohort_members as materialized/i);
  assert.match(migration, /cohort_activity_days as materialized/i);
  assert.match(
    migration,
    /date_trunc\('week', users\.created_at at time zone 'Asia\/Seoul'\)/i
  );
  assert.match(migration, /'weekIndex'/);
  assert.match(migration, /'isComplete'/);
});

test("dashboard sections use independent service-role-only aggregations", () => {
  for (const section of ["conversion", "engagement", "retention"]) {
    assert.match(
      sectionMigration,
      new RegExp(
        `create or replace function public\\.get_ops_talent_metrics_${section}_v1`,
        "i"
      )
    );
    assert.match(
      sectionMigration,
      new RegExp(
        `revoke all on function public\\.get_ops_talent_metrics_${section}_v1[\\s\\S]*?from public`,
        "i"
      )
    );
    assert.match(
      sectionMigration,
      new RegExp(
        `grant execute on function public\\.get_ops_talent_metrics_${section}_v1[\\s\\S]*?to service_role`,
        "i"
      )
    );
  }

  assert.doesNotMatch(
    sectionFunctionBodies,
    /public\.get_ops_talent_metrics_v[12]\s*\(/i
  );
  assert.match(sectionMigration, /information\s*->>\s*'testOnly'/i);
  assert.match(sectionMigration, /matchharper\.com/i);
});

test("metric functions revoke the default anon and authenticated grants", () => {
  // Supabase는 public 스키마 함수에 anon·authenticated 실행 권한을 따로 준다. from public만으로는 회수되지 않는다.
  for (const name of [
    "get_ops_talent_metrics_conversion_v1",
    "get_ops_talent_metrics_engagement_v1",
    "get_ops_talent_metrics_retention_v1",
    "get_ops_talent_metrics_v1",
    "get_ops_talent_metrics_v2",
  ]) {
    assert.match(
      sectionMigration,
      new RegExp(
        `revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`,
        "i"
      )
    );
  }
});

test("Harper tool calls are not counted as talent activity", () => {
  const toolCallExclusions = activityMigration.match(
    /left\(coalesce\(log\.type, ''\), 16\) <> 'career_tool_call'/g
  );
  // engagement와 retention의 활동 로그 조건 각각에 한 번씩.
  assert.equal(toolCallExclusions?.length, 2);
});

test("summary DAU and WAU use the last complete KST day", () => {
  assert.match(activityMigration, /'summaryDate', metric\.summary_date::text/);
  assert.match(
    activityMigration,
    /where activity\.activity_date = period\.summary_date\s+and activity\.activity_date >= period\.start_date\s+\) as dau/
  );
  assert.match(
    activityMigration,
    /greatest\(period\.start_date, period\.summary_date - 6\)/
  );
  assert.match(
    activityMigration,
    /v_comparison_summary_date := v_summary_date - \(v_to - v_from \+ 1\);/
  );
});
