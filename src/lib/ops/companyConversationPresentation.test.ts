import assert from "node:assert/strict";
import test from "node:test";
import {
  chronologicalMessages,
  continuesConversationMessage,
  displaySlackMentions,
  conversationTimeline,
} from "./companyConversationPresentation";
import type {
  OpsCompanyConversationItem,
  OpsCompanyThreadSummary,
} from "./company";

function message(
  id: number,
  threadId: string | null,
  ts: string
): OpsCompanyConversationItem {
  return {
    messageId: id,
    content: `message ${id}`,
    conversationId: `conversation-${id}`,
    occurredAt: new Date(Number(ts) * 1000).toISOString(),
    role: "user",
    source: threadId ? "slack" : "web",
    slackThread: threadId
      ? {
          id: threadId,
          rootTs: "100.000001",
          messageTs: ts,
          channelId: threadId,
          channelName: null,
          isRoot: ts === "100.000001",
        }
      : null,
    user: { email: null, name: null, slackUserId: null },
  };
}

test("deduplicates mirrored Slack messages across pages without merging different threads or web messages", () => {
  const items = [
    message(1, "a", "101.000001"),
    message(2, "a", "101.000001"),
    message(3, "b", "101.000001"),
    message(4, null, "101.000001"),
    message(5, null, "101.000001"),
  ];
  assert.deepEqual(
    chronologicalMessages(items)
      .map((m) => m.messageId)
      .sort((a, b) => a - b),
    [1, 3, 4, 5]
  );
});

test("orders replies by Slack timestamp even when records were imported later", () => {
  const older = {
    ...message(2, "a", "101.000001"),
    occurredAt: new Date(999000).toISOString(),
  };
  assert.deepEqual(
    chronologicalMessages([message(1, "a", "102.000001"), older]).map(
      (m) => m.messageId
    ),
    [2, 1]
  );
});

test("groups interleaved replies once and uses a root outside the current page with the complete reply count", () => {
  const root = message(1, "a", "100.000001");
  const summary: OpsCompanyThreadSummary = {
    root,
    thread: root.slackThread!,
    replyCount: 45,
  };
  const entries = conversationTimeline(
    [
      message(2, "a", "101.000001"),
      message(3, null, "102.000001"),
      message(4, "a", "103.000001"),
    ],
    [summary]
  );
  assert.equal(entries.length, 2);
  assert.equal(entries[0].message.messageId, 3);
  assert.equal(entries[1].summary?.root?.messageId, 1);
  assert.equal(entries[1].summary?.replyCount, 45);
});

test("keeps a missing root explicit instead of promoting a reply to root", () => {
  const reply = message(2, "a", "101.000001");
  const entries = conversationTimeline(
    [reply],
    [{ thread: reply.slackThread!, root: null, replyCount: 1 }]
  );
  assert.equal(entries[0].summary?.root, null);
});

test("groups only the same identified author within five minutes in the same channel and Korean day", () => {
  const first = {
    ...message(1, "a", "100"),
    user: { name: null, email: null, slackUserId: "U1" },
  };
  const next = { ...message(2, "a", "200"), user: first.user };
  assert.equal(continuesConversationMessage(first, next), true);
  assert.equal(
    continuesConversationMessage(first, {
      ...next,
      user: { ...next.user, slackUserId: "U2" },
    }),
    false
  );
  assert.equal(
    continuesConversationMessage(first, {
      ...message(2, "b", "200"),
      user: first.user,
    }),
    false
  );
  assert.equal(
    continuesConversationMessage(first, {
      ...message(2, "a", "401"),
      user: first.user,
    }),
    false
  );
  assert.equal(
    continuesConversationMessage(
      message(1, "a", "100"),
      message(2, "a", "200")
    ),
    false
  );
  const midnight = Date.parse("2026-10-19T00:00:00+09:00") / 1000;
  assert.equal(
    continuesConversationMessage(
      { ...message(1, "a", String(midnight - 1)), user: first.user },
      { ...message(2, "a", String(midnight + 1)), user: first.user }
    ),
    false
  );
});

test("renders Slack mention syntax with known names, preserves unresolved IDs and leaves code untouched", () => {
  const names = new Map([["U1", "Junil"]]);
  assert.equal(
    displaySlackMentions("<@U1> <@U2> <#C1|hiring> `<@U1>`", names),
    "[@Junil](https://slack.com/team/U1) [@U2](https://slack.com/team/U2) [#hiring](https://slack.com/archives/C1) `<@U1>`"
  );
  assert.equal(
    displaySlackMentions("```\n<@U1>\n```", names),
    "```\n<@U1>\n```"
  );
});

test("channel view keeps the root at its original time while the recent preview follows latest replies", () => {
  const root = message(1, "a", "100.000001");
  const summary = { root, thread: root.slackThread!, replyCount: 1 };
  const items = [message(2, null, "102.000001"), message(3, "a", "103.000001")];
  assert.equal(
    conversationTimeline(items, [summary])[1].summary?.root?.messageId,
    1
  );
  assert.equal(
    conversationTimeline(items, [summary], "message")[0].summary?.root
      ?.messageId,
    1
  );
});
