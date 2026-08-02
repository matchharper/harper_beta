import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "./admin";
import {
  getCareerOnboardingChecklistCoverage,
  getOrCreateCareerOnboardingCall,
} from "./calls";

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
