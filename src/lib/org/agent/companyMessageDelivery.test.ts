import assert from "node:assert/strict";
import test from "node:test";
import { deliverCompanyMessageBatch } from "./companyMessageDelivery.server";

function fixture() {
  const rows = [1, 2, 3].map(id => ({ id, role_id: id === 1 ? null : "role", content: `part ${id}`,
    metadata: { companyMessageBatch: { batchId: "batch", channelDbId: "channel", replyToMessageId: id === 3 ? 2 : null } } as any }));
  const threads = new Map<string, any>();
  const attempts = new Set<number>();
  const receipts = new Map<string, any>();
  const sent: number[] = [];
  let failAfterPost = 0, linkFailure = false, allowed = true;
  const admin: any = {
    from(table: string) {
      const filters: any = {};
      const q: any = { select() { return q; }, eq(k: string, v: unknown) { filters[k] = v; return q; }, contains() { return q; },
        order() { return Promise.resolve({ data: structuredClone(rows), error: null }); },
        maybeSingle() { return Promise.resolve({ data: { id: "channel", slack_channel_id: "C1", is_enabled: true } }); },
        single() { assert.equal(table, "company_slack_threads"); return Promise.resolve({ data: threads.get(filters.id) }); } };
      return q;
    },
    async rpc(name: string, args: any) {
      if (name === "begin_company_message_delivery_v1") {
        const recoveryRequired = attempts.has(args.p_message_id); attempts.add(args.p_message_id);
        return { data: { recoveryRequired, attemptedAt: "2026-10-15T07:00:00Z" } };
      }
      assert.equal(name, "record_company_message_receipt_v1");
      rows.find(row => row.id === args.p_message_id)!.metadata.companyMessageReceipt = args.p_receipt;
      return { data: null };
    },
  };
  const deps: any = { admin: () => admin, allowed: async () => allowed,
    links: async () => { if (linkFailure) throw Error("link read failed"); return { roleTargets: [], talentTargets: [] }; },
    send: async (args: any) => {
      const id = Number(args.idempotencyKey.split(":").at(-1)); sent.push(id);
      if (id === 3) assert.equal(args.threadTs, "ts-2");
      const threadId = id === 3 ? "thread-2" : `thread-${id}`;
      threads.set(threadId, { slack_thread_ts: id === 3 ? "ts-2" : `ts-${id}`, role_id: args.roleId });
      const receipt = { threadId, channelId: "C1", slackMessageTs: `ts-${id}` };
      receipts.set(args.idempotencyKey, receipt);
      if (failAfterPost === id) { failAfterPost = 0; throw Error("receipt lost after Slack accepted"); }
      await args.onPosted(receipt); return true;
    },
    reconcile: async (args: any) => { const receipt = receipts.get(args.idempotencyKey); if (!receipt) throw Error("uncertain"); return receipt; },
  };
  return { rows, attempts, sent, deps, failAfterPost: (id: number) => { failAfterPost = id; },
    linkFailure: (value: boolean) => { linkFailure = value; }, allowed: (value: boolean) => { allowed = value; } };
}

test("partial delivery recovers the exact posted parent and resumes its reply without reposting", async () => {
  const f = fixture(); f.failAfterPost(2);
  let startChecks = 0;
  const args = { batchId: "batch", workspaceId: "workspace", assertCanStart: async () => { startChecks++; } };
  await assert.rejects(deliverCompanyMessageBatch(args, f.deps), /receipt lost/);
  assert.deepEqual(f.sent, [1, 2]);
  await deliverCompanyMessageBatch(args, f.deps);
  await deliverCompanyMessageBatch(args, f.deps);
  assert.deepEqual(f.sent, [1, 2, 3]);
  assert.equal(startChecks, 1);
  assert.ok(f.rows.every(row => row.metadata.companyMessageReceipt));
});

test("a failed read before Slack leaves the delivery retryable", async () => {
  const f = fixture(); f.linkFailure(true);
  await assert.rejects(deliverCompanyMessageBatch({ batchId: "batch", workspaceId: "workspace" }, f.deps), /link read/);
  assert.equal(f.attempts.size, 0);
  f.linkFailure(false);
  await deliverCompanyMessageBatch({ batchId: "batch", workspaceId: "workspace" }, f.deps);
  assert.deepEqual(f.sent, [1, 2, 3]);
});

test("current audience denial stops even a partially delivered batch", async () => {
  const f = fixture(); f.failAfterPost(2);
  await assert.rejects(deliverCompanyMessageBatch({ batchId: "batch", workspaceId: "workspace" }, f.deps));
  f.allowed(false);
  await assert.rejects(deliverCompanyMessageBatch({ batchId: "batch", workspaceId: "workspace" }, f.deps), /no longer allowed/);
  assert.deepEqual(f.sent, [1, 2]);
});
