import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "./admin";
import {
  getCareerOnboardingChecklistCoverage,
  getOnboardingChecklistCoverageStats,
  getOrCreateCareerOnboardingCall,
  serializeOnboardingChecklistProgress,
} from "./calls";
import { ONBOARDING_QUESTION_CHECKLIST } from "./insightChecklist";

test("serializes checklist coverage into the canonical client progress shape", () => {
  const progress = serializeOnboardingChecklistProgress(
    getOnboardingChecklistCoverageStats({
      compensation: "covered",
      location: "covered",
      search_intensity: "covered",
    })
  );

  assert.equal(progress.coveredCount, 3);
  assert.equal(progress.totalCount, 9);
  assert.equal(progress.percent, 33);
  assert.equal(progress.completed, false);
});

test("excludes final confirmation from both sides of displayed progress", () => {
  const beforeFinalConfirmation = serializeOnboardingChecklistProgress(
    getOnboardingChecklistCoverageStats({ compensation: "covered" })
  );
  const afterFinalConfirmation = serializeOnboardingChecklistProgress(
    getOnboardingChecklistCoverageStats({
      compensation: "covered",
      final_priority_confirmation: "covered",
    })
  );

  assert.equal(afterFinalConfirmation.coveredCount, 1);
  assert.equal(afterFinalConfirmation.totalCount, 9);
  assert.equal(afterFinalConfirmation.percent, 11);
  assert.equal(afterFinalConfirmation.finalConfirmationCovered, true);
  assert.equal(afterFinalConfirmation.percent, beforeFinalConfirmation.percent);
});

test("requires every common checklist item for completion", () => {
  const completeCoverage = Object.fromEntries(
    ONBOARDING_QUESTION_CHECKLIST.map((item) => [item.key, "covered" as const])
  );
  assert.equal(
    getOnboardingChecklistCoverageStats(completeCoverage).isComplete,
    true
  );

  const withoutTeamStyle = { ...completeCoverage };
  delete withoutTeamStyle.team_style_fit;
  assert.equal(
    getOnboardingChecklistCoverageStats(withoutTeamStyle).isComplete,
    false
  );
});

function createSettingQuery(result: {
  data: { is_onboarding_done: boolean } | null;
  error: { code?: string; message?: string } | null;
}) {
  const query = {
    eq() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    select() {
      return query;
    },
  };
  return query;
}

function createActiveCallLookup(result: {
  data: unknown;
  error: { code?: string; message?: string } | null;
}) {
  const query = {
    eq() {
      return query;
    },
    limit() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    order() {
      return query;
    },
    select() {
      return query;
    },
  };
  return query;
}

function createGuardedInsert() {
  const result = {
    data: null,
    error: {
      code: "23514",
      message:
        "active career onboarding call is not allowed after onboarding completion",
    },
  };
  const query = {
    insert() {
      return query;
    },
    select() {
      return query;
    },
    single() {
      return Promise.resolve(result);
    },
  };
  return query;
}

test("does not create an active call when onboarding is already complete", async () => {
  const tables: string[] = [];
  const admin = {
    from(table: string) {
      tables.push(table);
      if (table === "talent_setting") {
        return createSettingQuery({
          data: { is_onboarding_done: true },
          error: null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as TalentAdminClient;

  const call = await getOrCreateCareerOnboardingCall({
    admin,
    userId: "talent-1",
  });

  assert.equal(call, null);
  assert.deepEqual(tables, ["talent_setting"]);
});

test("treats the database completion guard as a completed race", async () => {
  let talentCallQueryCount = 0;
  const admin = {
    from(table: string) {
      if (table === "talent_setting") {
        return createSettingQuery({
          data: { is_onboarding_done: false },
          error: null,
        });
      }
      if (table === "talent_calls") {
        talentCallQueryCount += 1;
        if (talentCallQueryCount === 1) {
          return createActiveCallLookup({ data: null, error: null });
        }
        return createGuardedInsert();
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as TalentAdminClient;

  const call = await getOrCreateCareerOnboardingCall({
    admin,
    userId: "talent-1",
  });

  assert.equal(call, null);
  assert.equal(talentCallQueryCount, 2);
});

test("returns insight-backed coverage without recreating a completed call", async () => {
  const admin = {
    from(table: string) {
      if (table === "talent_setting") {
        return createSettingQuery({
          data: { is_onboarding_done: true },
          error: null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as TalentAdminClient;

  const coverage = await getCareerOnboardingChecklistCoverage({
    admin,
    currentInsightContent: {
      location: "Seoul, South Korea",
      search_intensity: "Actively looking",
    },
    userId: "talent-1",
  });

  assert.deepEqual(coverage, {
    location: "covered",
    search_intensity: "covered",
  });
});
