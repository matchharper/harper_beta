import assert from "node:assert/strict";
import test from "node:test";
import { markScheduledSlackCopy, saveScheduledReply, scheduledMatchingAssignment, scheduledReplyRoute } from "./scheduledMatching";

const base = { reply: "한 문장", addedNobody: false, hasSlackChannel: true, messages: "origin" } as const;

test("a reply is kept in the Role conversation with or without Slack", () => {
  assert.deepEqual(scheduledReplyRoute({ ...base, hasSlackChannel: true }), { conversation: true, slack: true });
  assert.deepEqual(scheduledReplyRoute({ ...base, hasSlackChannel: false }), { conversation: true, slack: false });
  assert.deepEqual(scheduledReplyRoute({ ...base, reply: "  \n " }), { conversation: false, slack: false });
});

test("the one-line note about a search that added nobody does not post to Slack", () => {
  assert.deepEqual(scheduledReplyRoute({ ...base, addedNobody: true }), { conversation: true, slack: false });
  assert.deepEqual(scheduledReplyRoute({ ...base, addedNobody: true, reply: "한 문장\n\n더 알릴 내용" }), { conversation: true, slack: true });
});

test("schedule messages off keeps the conversation as it is and Slack as it was", () => {
  assert.deepEqual(scheduledReplyRoute({ ...base, messages: "off" }), { conversation: false, slack: true });
  assert.deepEqual(scheduledReplyRoute({ ...base, messages: "off", hasSlackChannel: false }), { conversation: false, slack: false });
  assert.deepEqual(scheduledReplyRoute({ ...base, messages: "off", addedNobody: true }), { conversation: false, slack: false });
  assert.deepEqual(scheduledReplyRoute({ ...base, messages: "chat" }), { conversation: true, slack: true });
});

function fakeAdmin(rows: Array<Record<string, any>>) {
  const updates: Array<Record<string, any>> = [];
  const admin = { from: (table: string) => {
    let id: unknown;
    let patch: Record<string, any> | null = null;
    const builder: any = {
      select: () => builder, eq: (column: string, value: unknown) => { if (column === "id") id = value; return builder; },
      contains: () => builder, limit: () => builder,
      update: (values: Record<string, any>) => { patch = values; return builder; },
      insert: (row: Record<string, any>) => { const created = { id: 55, ...row }; rows.push(created); return { select: () => ({ single: async () => ({ data: created, error: null }) }) }; },
      single: async () => ({ data: rows.find((row) => row.id === id), error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (patch) { updates.push({ table, id, ...patch }); return Promise.resolve({ error: null }).then(resolve); }
        return Promise.resolve({ data: rows.filter((row) => row.message_type === "chat"), error: null }).then(resolve);
      },
    };
    return builder;
  } };
  return { admin, updates };
}

const conversation = { id: "conversation", company_workspace_id: "workspace", role_id: "role" } as any;

test("the reply is saved once as a web message of this job", async () => {
  const rows: Array<Record<string, any>> = [];
  const { admin } = fakeAdmin(rows);
  const args = { admin, conversation, jobId: "job-1", reply: "이번엔 추가된 분이 없어요.", model: "m" };
  assert.equal(await saveScheduledReply(args), 55);
  assert.equal(rows[0].message_type, "chat");
  assert.equal(rows[0].role_id, "role");
  assert.deepEqual(rows[0].metadata, { source: "scheduled_matching", webActionJobId: "job-1" });
  assert.equal(await saveScheduledReply(args), 55);
  assert.equal(rows.length, 1);
});

test("the Slack row keeps its batch and points at the web copy", async () => {
  const rows = [{ id: 7, message_type: "slack", metadata: { companyMessageBatch: { batchId: "b" } } }];
  const { admin, updates } = fakeAdmin(rows);
  await markScheduledSlackCopy({ admin, slackMessageId: 7, savedMessageId: 55 });
  assert.deepEqual(updates, [{ table: "company_messages", id: 7, metadata: { companyMessageBatch: { batchId: "b" }, companyEventUiDuplicateOf: 55 } }]);
});

test("the review tells Harper to say why nobody was added and that one line stays off Slack", () => {
  const text = scheduledMatchingAssignment({ roleId: "r", scheduledSlot: "2026-11-09T00:00:00Z", rootJobId: "j", inventory: {}, currentRoutes: [] });
  assert.match(text, /added nobody/);
  assert.match(text, /what you suggest next/);
  assert.match(text, /not posted to Slack/);
});
