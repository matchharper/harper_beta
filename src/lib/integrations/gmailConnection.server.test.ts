import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

test("a read connection tells a waiting application and leaves the inbox review to wait its turn", async (t) => {
  const modules = Module as any;
  const originalLoad = modules._load;
  const calls: string[] = [];
  t.mock.method(modules, "_load", function (this: unknown, name: string, parent: any, ...args: any[]) {
    if (parent?.filename?.endsWith("/integrations/gmailConnection.server.ts")) {
      if (name === "@/lib/career/onboardingContinuation.server") return { scheduleCareerConversationContinuation: () => calls.push("run") };
      if (name === "@/lib/career/emailWriting/sync") return { wakeMailSyncForUser: async () => { calls.push("sync"); } };
      if (name === "@/lib/career/background/gmailReview") return {
        scheduleLocalGmailReview: () => calls.push("local review"),
        notifyApplicationAwaitingEmailCode: async () => { calls.push("notify"); throw new Error("event unavailable"); },
      };
    }
    return originalLoad.call(this, name, parent, ...args);
  });
  const { confirmCareerGmailConnection } = require("./gmailConnection.server");
  const logged: unknown[] = [];
  const admin = (receipt: unknown) => ({
    rpc: async () => ({ data: receipt, error: null }),
    from: (table: string) => ({ insert: async (row: unknown) => { logged.push({ table, row }); return { error: null }; } }),
  });

  // A failed notice never fails the connection the person just made.
  assert.deepEqual(await confirmCareerGmailConnection({ admin: admin({ conversationId: "c", connectionChanged: true, review: { id: "r" } }),
    talentId: "u", connectedAccountId: "ca", readGranted: true }), { conversationId: "c" });
  assert.deepEqual(calls, ["local review", "notify", "sync"]);
  // Every confirmed connection leaves the server's own record.
  assert.deepEqual(logged, [{ table: "logs", row: { user_id: "u", type: "career_gmail_connection_confirmed", meta_data: { read: true, changed: true } } }]);

  calls.length = 0;
  await confirmCareerGmailConnection({ admin: admin({ conversationId: "c", connectionChanged: true }), talentId: "u", connectedAccountId: "ca", readGranted: false });
  assert.deepEqual(calls, []);
  // A failed record never fails the connection.
  assert.deepEqual(await confirmCareerGmailConnection({ admin: { rpc: async () => ({ data: { conversationId: "c" }, error: null }) },
    talentId: "u", connectedAccountId: "ca", readGranted: false }), { conversationId: "c" });
});
