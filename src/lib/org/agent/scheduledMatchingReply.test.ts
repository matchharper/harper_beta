import assert from "node:assert/strict";
import test from "node:test";
import { addedCandidateFact, markScheduledSlackCopy, saveScheduledReply, scheduledMatchingAssignment, scheduledReplyRoute } from "./scheduledMatching";

const base = { reply: "한 문장", hasSlackChannel: true, messages: "origin" } as const;

test("a reply is kept in the Role conversation with or without Slack", () => {
  assert.deepEqual(scheduledReplyRoute({ ...base, hasSlackChannel: true }), { conversation: true, slack: true });
  assert.deepEqual(scheduledReplyRoute({ ...base, hasSlackChannel: false }), { conversation: true, slack: false });
  assert.deepEqual(scheduledReplyRoute({ ...base, reply: "  \n " }), { conversation: false, slack: false });
});

test("Harper's words about someone added are the words of their card", () => {
  assert.deepEqual(addedCandidateFact({ name: " 한지우 ", headline: "백엔드", harperNote: "결제 경험", tldr: "요약" }),
    { name: "한지우", headline: "백엔드", whyShown: "결제 경험" });
  assert.equal(addedCandidateFact({ tldr: "요약" }).whyShown, "요약");
  assert.deepEqual(addedCandidateFact(null), { name: "", headline: "", whyShown: "" });
});

test("schedule messages off keeps the conversation as it is and Slack as it was", () => {
  assert.deepEqual(scheduledReplyRoute({ ...base, messages: "off" }), { conversation: false, slack: true });
  assert.deepEqual(scheduledReplyRoute({ ...base, messages: "off", hasSlackChannel: false }), { conversation: false, slack: false });
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

test("the review has Harper report once the search is finished, either way", () => {
  const added = [{ name: "한지우", headline: "백엔드", whyShown: "결제 경험" }];
  const text = scheduledMatchingAssignment({ roleId: "r", scheduledSlot: "2026-11-09T00:00:00Z", rootJobId: "j", inventory: {}, currentRoutes: [],
    completedRuns: [{ runId: "x", addedToCompanyReview: added }] });
  assert.match(text, /write nothing yet: completion\nresumes this review/);
  assert.match(text, /addedToCompanyReview\), say why/);
  assert.match(text, /When nobody was added, say why/);
  assert.doesNotMatch(text, /Silence is/);
  assert.match(text, /한지우/);
  assert.match(text, /결제 경험/);
});
