import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const baseMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260908140000_ops_talent_metrics_activity_days.sql",
    import.meta.url
  ),
  "utf8"
);

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260908200000_ops_talent_metrics_cohort_retention.sql",
    import.meta.url
  ),
  "utf8"
);

const sectionMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260908210000_ops_talent_metrics_sections.sql",
    import.meta.url
  ),
  "utf8"
);

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
    sectionMigration,
    /public\.get_ops_talent_metrics_v[12]\s*\(/i
  );
  assert.match(sectionMigration, /information\s*->>\s*'testOnly'/i);
  assert.match(sectionMigration, /matchharper\.com/i);
});
