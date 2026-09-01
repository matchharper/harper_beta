import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTACT_QUEUE_TYPE_SIGNUP_NO_PROFILE_SUBMIT,
  enqueueSignupNoProfileSubmit,
} from "@/lib/contactQueue";

function createAdmin(args?: {
  insertError?: { code?: string; message?: string } | null;
  onboardingDone?: boolean;
}) {
  const inserted: Array<Record<string, unknown>> = [];
  let upsertCalled = false;
  const admin = {
    from(table: string) {
      assert.ok(table === "talent_setting" || table === "contact_queue");
      return {
        insert(payload: Record<string, unknown>) {
          inserted.push(payload);
          return Promise.resolve({ error: args?.insertError ?? null });
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: { is_onboarding_done: args?.onboardingDone ?? false },
                    error: null,
                  });
                },
              };
            },
          };
        },
        upsert() {
          upsertCalled = true;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin, inserted, wasUpsertCalled: () => upsertCalled };
}

test("signup reminder uses an insert compatible with the partial unique index", async () => {
  const fixture = createAdmin();

  await enqueueSignupNoProfileSubmit({
    admin: fixture.admin as never,
    payload: { source: "test" },
    userId: "talent-1",
  });

  assert.equal(fixture.wasUpsertCalled(), false);
  assert.equal(fixture.inserted.length, 1);
  assert.equal(
    fixture.inserted[0]?.type,
    CONTACT_QUEUE_TYPE_SIGNUP_NO_PROFILE_SUBMIT
  );
  assert.equal(fixture.inserted[0]?.user_id, "talent-1");
});

test("signup reminder treats a duplicate insert as idempotent", async () => {
  const fixture = createAdmin({
    insertError: { code: "23505", message: "duplicate key value" },
  });

  await enqueueSignupNoProfileSubmit({
    admin: fixture.admin as never,
    userId: "talent-1",
  });

  assert.equal(fixture.inserted.length, 1);
});

test("signup reminder still surfaces non-unique database failures", async () => {
  const fixture = createAdmin({
    insertError: { code: "57014", message: "statement timeout" },
  });

  await assert.rejects(
    enqueueSignupNoProfileSubmit({
      admin: fixture.admin as never,
      userId: "talent-1",
    }),
    /statement timeout/
  );
});
