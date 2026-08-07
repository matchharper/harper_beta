import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeOrgAgentMessageMetadata,
  resolveAdoptableSlackUserMessageIdentity,
} from "@/lib/org/agent/messageIdempotency";
import { isOrgAgentRetainedDataActivationActive } from "@/lib/org/agent/retention";

const activatedAt = "2026-08-05T00:00:00.000Z";

test("retained get_more_data lease is active for T1 through T3", () => {
  for (const startedUserTurns of [1, 2, 3]) {
    assert.equal(
      isOrgAgentRetainedDataActivationActive({
        activatedAt,
        now: new Date("2026-08-05T01:00:00.000Z"),
        startedUserTurns,
      }),
      true
    );
  }
  assert.equal(
    isOrgAgentRetainedDataActivationActive({
      activatedAt,
      now: new Date("2026-08-05T01:00:00.000Z"),
      startedUserTurns: 4,
    }),
    false
  );
});

test("retained get_more_data lease expires after 24 hours", () => {
  assert.equal(
    isOrgAgentRetainedDataActivationActive({
      activatedAt,
      now: new Date("2026-08-06T00:00:00.001Z"),
      startedUserTurns: 1,
    }),
    false
  );
});

test("only a duplicate Slack user message receives an adoptable exact identity", () => {
  const common = {
    content: "채용 기준을 바꿔 주세요",
    conversationId: "conversation-1",
    errorCode: "23505",
    messageType: "slack",
    role: "user",
    slackMessageTs: "1722816060.100",
    slackThreadId: "thread-1",
    workspaceId: "workspace-1",
  };

  assert.deepEqual(resolveAdoptableSlackUserMessageIdentity(common), {
    content: common.content,
    conversationId: common.conversationId,
    messageType: "slack",
    role: "user",
    slackMessageTs: common.slackMessageTs,
    slackThreadId: common.slackThreadId,
    workspaceId: common.workspaceId,
  });
  assert.equal(
    resolveAdoptableSlackUserMessageIdentity({
      ...common,
      role: "assistant",
    }),
    null
  );
  assert.equal(
    resolveAdoptableSlackUserMessageIdentity({
      ...common,
      errorCode: "other",
    }),
    null
  );
  assert.equal(
    resolveAdoptableSlackUserMessageIdentity({
      ...common,
      slackMessageTs: "",
    }),
    null
  );
});

test("adopted Slack metadata is enriched without discarding sync metadata", () => {
  const merged = mergeOrgAgentMessageMetadata(
    { retained: "yes", source: "slack_thread_event" },
    { slackUserName: "김호진", source: "org_agent_slack_user" }
  );

  assert.equal(merged.changed, true);
  assert.deepEqual(merged.metadata, {
    retained: "yes",
    slackUserName: "김호진",
    source: "org_agent_slack_user",
  });
  assert.equal(
    mergeOrgAgentMessageMetadata(merged.metadata, {}).changed,
    false
  );
});

test("Slack history cursor is opaque and reads the next older page", async () => {
  const {
    createOrgAgentConversationHistoryCursor,
    fetchOrgAgentConversationHistory,
    OrgAgentConversationHistoryCursorError,
  } = await import("@/lib/org/agent/conversationHistory");
  const makeRow = (id: number, content: string) => ({
    content,
    created_at: `2026-08-06T00:00:${String(id).padStart(2, "0")}.000Z`,
    id,
    mentions: [],
    metadata: { slackUserName: "사용자" },
    role: "user",
    slack_thread_id: "thread-1",
    slack_user_id: "U1",
  });
  const cursor = createOrgAgentConversationHistoryCursor({
    beforeId: 20,
    scope: "current_thread",
    slackThreadId: "thread-1",
  });

  assert.doesNotMatch(cursor, /thread-1|20/);

  const filters: Array<[string, unknown]> = [];
  const messageQuery = {
    eq(field: string, value: unknown) {
      filters.push([`eq:${field}`, value]);
      return this;
    },
    limit() {
      return Promise.resolve({ data: [makeRow(10, "older")], error: null });
    },
    lt(field: string, value: unknown) {
      filters.push([`lt:${field}`, value]);
      return this;
    },
    not() {
      return this;
    },
    order() {
      return this;
    },
    select() {
      return this;
    },
  };
  const threadQuery = {
    in() {
      return Promise.resolve({
        data: [
          {
            channel: { slack_channel_name: "채용" },
            id: "thread-1",
            slack_thread_ts: "1785960000.000",
          },
        ],
        error: null,
      });
    },
    select() {
      return this;
    },
  };
  const history = await fetchOrgAgentConversationHistory({
    admin: {
      from: (table: string) =>
        table === "company_messages" ? messageQuery : threadQuery,
    } as any,
    conversationId: "conversation-1",
    currentSlackThreadId: "thread-1",
    currentUserMessageId: 40,
    cursor,
    limit: 2,
    scope: "current_thread",
    workspaceId: "workspace-1",
  });

  assert.deepEqual(
    history.messages.map((message) => message.content),
    ["older"]
  );
  assert.equal(history.messages[0]?.channelName, "채용");
  assert.equal(history.messages[0]?.currentThread, true);
  assert.deepEqual(filters.find(([name]) => name === "lt:id"), ["lt:id", 20]);
  await assert.rejects(
    fetchOrgAgentConversationHistory({
      admin: { from: () => messageQuery } as any,
      conversationId: "conversation-1",
      currentSlackThreadId: "thread-1",
      currentUserMessageId: 40,
      cursor,
      limit: 2,
      scope: "workspace",
      workspaceId: "workspace-1",
    }),
    OrgAgentConversationHistoryCursorError
  );
});
