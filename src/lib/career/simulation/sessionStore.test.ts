import test from "node:test";
import assert from "node:assert/strict";
import { sessionOperation } from "./sessionStore";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
test("development and production use the canonical activity RPC without fallback", async () => {
  const environment = process.env.NODE_ENV;
  try {
    for (const mode of ["development", "production"]) {
      Object.assign(process.env, { NODE_ENV: mode });
      let calls = 0;
      const admin = {
        rpc: async (name: string) => {
          assert.equal(name, "write_application_activity");
          calls++;
          return {
            data: null,
            error: { code: "PGRST202", message: "Migration required" },
          };
        },
        from: () => {
          throw new Error("Unexpected message fallback");
        },
      } as unknown as TalentAdminClient;
      await assert.rejects(
        () =>
          sessionOperation({
            admin,
            userId: "u",
            conversationId: "c",
            operation: "read",
          }),
        /Migration required/
      );
      assert.equal(calls, 1);
    }
  } finally {
    if (environment === undefined)
      Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: environment });
  }
});
