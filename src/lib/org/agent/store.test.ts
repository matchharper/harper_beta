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

test("Slack history cursor pages the thread index without exposing IDs", async () => {
  const {
    createOrgAgentThreadListCursor,
    fetchOrgAgentConversationHistory,
    OrgAgentConversationHistoryCursorError,
  } = await import("@/lib/org/agent/conversationHistory");
  const cursor = createOrgAgentThreadListCursor(20);

  assert.doesNotMatch(cursor, /thread-1|20/);

  let rpcArgs: Record<string, unknown> = {};
  const history = await fetchOrgAgentConversationHistory({
    admin: {
      from: () => {
        throw new Error("from should not be used for type=all");
      },
      rpc: (_name: string, args: Record<string, unknown>) => {
        rpcArgs = args;
        return Promise.resolve({
          data: [
            {
              channel_name: "채용",
              first_messages: [
                {
                  content: "첫 메시지",
                  createdAt: "2026-08-06T00:00:00.000Z",
                  metadata: { slackUserName: "사용자" },
                  role: "user",
                  slackUserId: "U1",
                },
              ],
              last_message_at: "2026-08-06T01:00:00.000Z",
              last_message_id: 10,
              message_count: 3,
              slack_thread_id: "thread-1",
              thread_started_at: "2026-08-06T00:00:00.000Z",
            },
            {
              channel_name: "채용",
              first_messages: [],
              last_message_at: "2026-08-05T01:00:00.000Z",
              last_message_id: 5,
              message_count: 2,
              slack_thread_id: "thread-2",
              thread_started_at: "2026-08-05T00:00:00.000Z",
            },
          ],
          error: null,
        });
      },
    } as any,
    conversationId: "conversation-1",
    currentSlackThreadId: "thread-1",
    currentUserMessageId: 40,
    cursor,
    limit: 1,
    type: "all",
    workspaceId: "workspace-1",
  });

  assert.equal(history.type, "all");
  if (history.type !== "all") return;
  assert.equal(history.threads[0]?.threadId, "thread-1");
  assert.equal(history.threads[0]?.currentThread, true);
  assert.equal(history.threads[0]?.firstMessages[0]?.content, "첫 메시지");
  assert.equal(history.hasMore, true);
  assert.ok(history.nextCursor);
  assert.equal(rpcArgs.p_before_last_message_id, 20);
  assert.equal(rpcArgs.p_limit, 2);
  assert.equal(rpcArgs.p_max_message_id, 40);

  let defaultRpcArgs: Record<string, unknown> = {};
  const defaultHistory = await fetchOrgAgentConversationHistory({
    admin: {
      from: () => {
        throw new Error("from should not be used for type=all");
      },
      rpc: (_name: string, args: Record<string, unknown>) => {
        defaultRpcArgs = args;
        return Promise.resolve({
          data: Array.from({ length: 6 }, (_, index) => ({
            channel_name: "채용",
            first_messages: [],
            last_message_at: `2026-08-0${6 - index}T01:00:00.000Z`,
            last_message_id: 30 - index,
            message_count: index + 1,
            slack_thread_id: `thread-${index + 1}`,
            thread_started_at: `2026-08-0${6 - index}T00:00:00.000Z`,
          })),
          error: null,
        });
      },
    } as any,
    conversationId: "conversation-1",
    currentSlackThreadId: "thread-1",
    currentUserMessageId: 40,
    type: "all",
    workspaceId: "workspace-1",
  });
  assert.equal(defaultHistory.type, "all");
  if (defaultHistory.type === "all") {
    assert.equal(defaultHistory.limit, 5);
    assert.equal(defaultHistory.threads.length, 5);
    assert.equal(defaultHistory.hasMore, true);
  }
  assert.equal(defaultRpcArgs.p_limit, 6);

  await assert.rejects(
    fetchOrgAgentConversationHistory({
      admin: { from: () => null, rpc: () => null } as any,
      conversationId: "conversation-1",
      currentSlackThreadId: "thread-1",
      currentUserMessageId: 40,
      cursor: "invalid-cursor",
      limit: 1,
      type: "all",
      workspaceId: "workspace-1",
    }),
    OrgAgentConversationHistoryCursorError
  );
});

test("selected Slack thread cursors continue older unsummarized messages", async () => {
  const { fetchOrgAgentConversationHistory } =
    await import("@/lib/org/agent/conversationHistory");
  const threadId = "thread-1";
  const makeAdmin = () => ({
    from: (table: string) => {
      let columns = "";
      let beforeId: number | null = null;
      const builder: any = {
        eq: () => builder,
        gt: () => builder,
        in: () => builder,
        limit: () => builder,
        lt: (_column: string, value: number) => {
          beforeId = value;
          return builder;
        },
        lte: () => builder,
        order: () => builder,
        select: (value: string) => {
          columns = value;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(
            table === "company_slack_threads"
              ? {
                  data: [
                    {
                      channel: { slack_channel_name: "채용" },
                      id: threadId,
                      slack_thread_ts: "1785722400.000000",
                    },
                  ],
                  error: null,
                }
              : {
                  data: Array.from(
                    { length: beforeId ? 5 : 41 },
                    (_, index) => {
                      const id = beforeId ? 5 - index : 45 - index;
                      return {
                        content: `message-${id}`,
                        created_at: new Date(
                          `2026-08-06T00:${String(id).padStart(2, "0")}:00.000Z`
                        ).toISOString(),
                        id,
                        metadata: {},
                        role: "user",
                        slack_user_id: "U1",
                      };
                    }
                  ),
                  error: null,
                }
          ).then(resolve),
        maybeSingle: async () => {
          if (table === "company_conversation_summaries") {
            return { data: null, error: null };
          }
          if (columns === "id, created_at") {
            return {
              count: 45,
              data: { created_at: "2026-08-06T00:45:00.000Z", id: 45 },
              error: null,
            };
          }
          throw new Error(`unexpected maybeSingle query: ${table} ${columns}`);
        },
      };
      return builder;
    },
    rpc: () => {
      throw new Error("rpc should not be used for type=thread");
    },
  });

  const first = await fetchOrgAgentConversationHistory({
    admin: makeAdmin() as any,
    conversationId: "conversation-1",
    currentSlackThreadId: threadId,
    currentUserMessageId: 45,
    threadIds: [threadId],
    type: "thread",
    workspaceId: "workspace-1",
  });
  assert.equal(first.type, "thread");
  if (first.type !== "thread") return;
  const firstThread = first.threads[0]!;
  assert.equal(firstThread.messages.length, 40);
  assert.equal(firstThread.hasMoreMessages, true);
  assert.ok(firstThread.nextCursor);
  assert.doesNotMatch(firstThread.nextCursor ?? "", /thread-1|message-6/);

  const older = await fetchOrgAgentConversationHistory({
    admin: makeAdmin() as any,
    conversationId: "conversation-1",
    currentSlackThreadId: threadId,
    currentUserMessageId: 45,
    cursor: firstThread.nextCursor,
    threadIds: [threadId],
    type: "thread",
    workspaceId: "workspace-1",
  });
  assert.equal(older.type, "thread");
  if (older.type !== "thread") return;
  assert.deepEqual(
    older.threads[0]?.messages.map((message) => message.content),
    ["message-1", "message-2", "message-3", "message-4", "message-5"]
  );
  assert.equal(older.threads[0]?.hasMoreMessages, false);
  assert.equal(older.threads[0]?.nextCursor, null);
});
