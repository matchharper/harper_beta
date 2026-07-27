import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  escapeTalentAccountEmailLikePattern,
  isTalentAccountEmailAvailable,
  isValidTalentAccountEmail,
  normalizeTalentAccountEmail,
  syncVerifiedTalentAccountEmail,
} from "@/lib/talentOnboarding/accountEmail";

test("normalizes account emails before comparison and persistence", () => {
  assert.equal(
    normalizeTalentAccountEmail("  Candidate@Example.COM  "),
    "candidate@example.com"
  );
  assert.equal(isValidTalentAccountEmail("candidate@example.com"), true);
  assert.equal(isValidTalentAccountEmail("candidate@example"), false);
  assert.equal(
    isValidTalentAccountEmail(`${"a".repeat(309)}@example.com`),
    false
  );
});

test("escapes LIKE wildcards when checking email availability", async () => {
  let checkedPattern = "";
  const admin = {
    from: () => {
      const query = {
        ilike: (_column: string, value: string) => {
          checkedPattern = value;
          return query;
        },
        limit: async () => ({ data: [], error: null }),
        neq: () => query,
        select: () => query,
      };
      return query;
    },
  } as unknown as SupabaseClient<any>;

  assert.equal(
    escapeTalentAccountEmailLikePattern(
      String.raw`candidate_name%tag\box@example.com`
    ),
    String.raw`candidate\_name\%tag\\box@example.com`
  );
  assert.equal(
    await isTalentAccountEmailAvailable(admin, {
      email: "candidate_name%tag@example.com",
      userId: "00000000-0000-0000-0000-000000000001",
    }),
    true
  );
  assert.equal(checkedPattern, String.raw`candidate\_name\%tag@example.com`);
});

test("never persists an email that Supabase Auth has not confirmed", async () => {
  const user = {
    email: "candidate@example.com",
    email_confirmed_at: null,
    id: "00000000-0000-0000-0000-000000000001",
  } as unknown as User;

  await assert.rejects(
    syncVerifiedTalentAccountEmail({
      admin: {} as SupabaseClient<any>,
      user,
    }),
    /인증되지 않은 이메일/
  );
});

test("skips duplicate checks when the verified email already matches the profile", async () => {
  const profile = {
    current_location: null,
    email: "candidate@example.com",
    name: "Candidate",
    profile_picture: null,
    user_id: "00000000-0000-0000-0000-000000000001",
  };
  let duplicateCheckCount = 0;

  const admin = {
    from: () => {
      const query = {
        eq: () => query,
        ilike: () => query,
        limit: async () => {
          duplicateCheckCount += 1;
          return {
            data: [{ user_id: "temporary-onboarding-record" }],
            error: null,
          };
        },
        maybeSingle: async () => ({ data: profile, error: null }),
        neq: () => query,
        select: () => query,
        single: async () => ({ data: profile, error: null }),
      };
      return query;
    },
  } as unknown as SupabaseClient<any>;

  const result = await syncVerifiedTalentAccountEmail({
    admin,
    user: {
      email: "candidate@example.com",
      email_confirmed_at: "2026-07-27T00:00:00.000Z",
      id: profile.user_id,
      new_email: "next@example.com",
      user_metadata: {},
    } as unknown as User,
  });

  assert.equal(result.changed, false);
  assert.equal(result.pendingEmail, "next@example.com");
  assert.equal(duplicateCheckCount, 0);
});

test("syncs a changed verified email without touching onboarding leads", async () => {
  const profile = {
    current_location: null,
    email: "before@example.com",
    name: "Candidate",
    profile_picture: null,
    user_id: "00000000-0000-0000-0000-000000000001",
  };
  const touchedTables: string[] = [];

  const admin = {
    from: (table: string) => {
      touchedTables.push(table);
      let updatePayload: Record<string, unknown> | null = null;
      const query = {
        eq: () => query,
        ilike: () => query,
        limit: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: profile, error: null }),
        neq: () => query,
        select: () => query,
        single: async () => ({
          data: updatePayload ? { ...profile, ...updatePayload } : profile,
          error: null,
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return query;
        },
      };
      return query;
    },
  } as unknown as SupabaseClient<any>;

  const result = await syncVerifiedTalentAccountEmail({
    admin,
    user: {
      email: "after@example.com",
      email_confirmed_at: "2026-07-27T00:00:00.000Z",
      id: profile.user_id,
      new_email: null,
      user_metadata: {},
    } as unknown as User,
  });

  assert.equal(result.changed, true);
  assert.equal(result.profile.email, "after@example.com");
  assert.equal(touchedTables.includes("career_email_onboarding_leads"), false);
  assert.deepEqual([...new Set(touchedTables)], ["talent_users"]);
});
