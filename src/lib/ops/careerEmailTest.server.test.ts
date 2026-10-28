import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import {
  EmailBusyError,
  EmailContinuationPending,
} from "@/lib/email/runtime/types";

let createOpsEmailTest: typeof import("./careerEmailTest.server").createOpsEmailTest;
let runOpsEmailTest: typeof import("./careerEmailTest.server").runOpsEmailTest;
let fetchOpsEmailTests: typeof import("./careerEmailTest.server").fetchOpsEmailTests;
before(async () => {
  const mod = Module as any,
    load = mod._load;
  mod._load = function (name: string, parent: unknown, main: boolean) {
    if (name === "@/lib/internalApi")
      return {
        InternalApiError: class extends Error {
          constructor(
            public status: number,
            message: string
          ) {
            super(message);
          }
        },
      };
    if (name === "@/lib/email/runtime/consumer") return {};
    if (name === "@/lib/email/runtime/store")
      return {
        updateRow: async (
          admin: any,
          table: string,
          id: string,
          patch: any
        ) => {
          await admin.from(table).update(patch).eq("id", id);
        },
        readRow: async (admin: any, table: string, id: string, column = "id") =>
          (await admin.from(table).select().eq(column, id).maybeSingle()).data,
      };
    return load.call(this, name, parent, main);
  };
  try {
    ({ createOpsEmailTest, fetchOpsEmailTests, runOpsEmailTest } =
      await import("./careerEmailTest.server"));
  } finally {
    mod._load = load;
  }
});

function fixture() {
  const tables: Record<string, any[]> = {
    talent_users: [{ user_id: "talent", email: "candidate@example.com" }],
    talent_conversations: [{ id: "live-conversation", user_id: "talent" }],
    email_inbound_events: [],
    email_reply_jobs: [],
    talent_messages: [],
  };
  const admin: any = {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = [];
      let write: any;
      let patch: any;
      let start = 0,
        end = Infinity;
      const run = () => {
        if (patch)
          tables[table]
            .filter((row) => filters.every((f) => f(row)))
            .forEach((row) => Object.assign(row, patch));
        if (write) {
          const existing =
            write.id && tables[table].find((row) => row.id === write.id);
          if (!existing)
            tables[table].push({
              id: `${table}-${tables[table].length}`,
              ...write,
            });
        }
        return {
          data: tables[table]
            .filter((row) => filters.every((f) => f(row)))
            .slice(start, end + 1),
          error: null,
        };
      };
      const q: any = {
        select: () => q,
        returns: () => q,
        order: () => q,
        update: (value: any) => {
          patch = value;
          return q;
        },
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return q;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[key]));
          return q;
        },
        range: (from: number, to: number) => {
          start = from;
          end = to;
          return q;
        },
        upsert: (row: any) => {
          write = row;
          return q;
        },
        insert: (row: any) => {
          write = row;
          return q;
        },
        single: async () => {
          const r = run();
          return { ...r, data: r.data.at(-1) };
        },
        maybeSingle: async () => {
          const r = run();
          return { ...r, data: r.data[0] ?? null };
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve(run()).then(resolve, reject),
      };
      return q;
    },
  };
  return { admin, tables };
}
const command = {
  requestId: "first",
  userId: "talent",
  content: "지원해 주세요.",
  subject: "지원",
};

test("test jobs always use the new worker, keep account ownership, and reuse the same job on HTTP retry", async () => {
  const f = fixture();
  await createOpsEmailTest(command, "operator", f.admin);
  await createOpsEmailTest(command, "operator", f.admin);
  assert.equal(f.tables.email_reply_jobs.length, 1);
  assert.equal(f.tables.email_inbound_events.length, 1);
  assert.equal(f.tables.talent_conversations.length, 2);
  const first = f.tables.email_reply_jobs[0];
  assert.equal(first.worker_target, "vercel_queue");
  assert.equal(first.kind, "ops_email_test");
  assert.equal(first.talent_id, "talent");
  assert.notEqual(first.conversation_id, "live-conversation");
  assert.equal(first.metadata.opsEmailTest.actorId, "operator");
  assert.equal(first.metadata.opsEmailTest.email.from, "candidate@example.com");
  await assert.rejects(
    () =>
      createOpsEmailTest(
        { ...command, content: "Changed" },
        "operator",
        f.admin
      ),
    /다른 입력/
  );
  await assert.rejects(
    () =>
      createOpsEmailTest(
        { ...command, requestId: "next", previousJobId: "first" },
        "operator",
        f.admin
      ),
    /처리 중/
  );
  first.status = "skipped";
  first.skip_reason = "ops_email_test";
  await createOpsEmailTest(
    {
      ...command,
      requestId: "next",
      previousJobId: "first",
      content: "이대로 만들어 주세요.",
    },
    "operator",
    f.admin
  );
  assert.equal(
    f.tables.email_reply_jobs[1].conversation_id,
    first.conversation_id
  );
  assert.equal(f.tables.talent_conversations.length, 2);
});

test("another account or a live email cannot be adopted as a test continuation", async () => {
  const f = fixture();
  f.tables.email_reply_jobs.push(
    {
      id: "foreign",
      kind: "ops_email_test",
      talent_id: "other",
      status: "skipped",
    },
    { id: "live", kind: "reply", talent_id: "talent", status: "sent" }
  );
  for (const previousJobId of ["foreign", "live"])
    await assert.rejects(
      () =>
        createOpsEmailTest({ ...command, previousJobId }, "operator", f.admin),
      /찾을 수 없습니다/
    );
  assert.equal(f.tables.email_inbound_events.length, 0);
  assert.equal(f.tables.talent_conversations.length, 1);
});

test("history exposes test completion without claiming delivery or leaking another account's reply", async () => {
  const f = fixture();
  f.tables.email_reply_jobs.push({
    id: "test",
    kind: "ops_email_test",
    talent_id: "talent",
    status: "skipped",
    skip_reason: "ops_email_test",
    assistant_message_id: 1,
    metadata: {
      opsEmailTest: { email: command },
      delivery: { html: "<p>Reply</p>" },
    },
  });
  f.tables.talent_messages.push({
    id: 1,
    user_id: "other",
    content: "Private",
  });
  const history = await fetchOpsEmailTests("talent", 0, f.admin);
  assert.equal(history.items[0].status, "completed");
  assert.equal(history.items[0].reply, null);
  assert.equal(history.nextOffset, null);
});

test("a queued test with a local Queue authentication error resumes through the shared consumer without publishing", async () => {
  const f = fixture();
  await createOpsEmailTest(command, "operator", f.admin);
  const job = f.tables.email_reply_jobs[0];
  job.queue_dispatch_error = "Failed to get OIDC token for local development.";
  assert.match(
    (await fetchOpsEmailTests("talent", 0, f.admin)).items[0].error!,
    /OIDC/
  );
  const seen: unknown[] = [];
  const result = await runOpsEmailTest(
    "talent",
    "first",
    f.admin,
    async (message, admin) => {
      seen.push(message);
      assert.equal(admin, f.admin);
      assert.equal(job.queue_dispatch_error, null);
      job.status = "skipped";
      job.skip_reason = "ops_email_test";
    }
  );
  assert.deepEqual(seen, [{ version: 1, kind: "reply", jobId: "first" }]);
  assert.equal(result.pending, false);
  assert.equal(f.tables.email_reply_jobs.length, 1);
  assert.equal(
    (await fetchOpsEmailTests("talent", 0, f.admin)).items[0].error,
    null
  );
});

test("runner rejects real emails and another account before invoking the consumer", async () => {
  const f = fixture();
  f.tables.email_reply_jobs.push(
    { id: "live", kind: "reply", talent_id: "talent", status: "queued" },
    {
      id: "foreign",
      kind: "ops_email_test",
      talent_id: "other",
      status: "queued",
    }
  );
  for (const id of ["live", "foreign"])
    await assert.rejects(
      () =>
        runOpsEmailTest("talent", id, f.admin, async () => {
          assert.fail("must not execute");
        }),
      /찾을 수 없습니다/
    );
});

test("runner preserves continuation and capacity retries but surfaces execution failures", async () => {
  const f = fixture();
  await createOpsEmailTest(command, "operator", f.admin);
  for (const error of [
    new EmailContinuationPending("preparing"),
    new EmailBusyError("capacity"),
  ]) {
    assert.deepEqual(
      await runOpsEmailTest("talent", "first", f.admin, async () => {
        throw error;
      }),
      { pending: true }
    );
  }
  await assert.rejects(
    () =>
      runOpsEmailTest("talent", "first", f.admin, async () => {
        throw new Error("Provider unavailable");
      }),
    /Provider unavailable/
  );
});
