import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";
import {
  fetchLatestUserAuthoredChatMessageId,
  hasUserAuthoredChatMessageAfter,
} from "./opportunityFeedbackFollowUpGuard";

type MessageRow = {
  conversation_id: string;
  created_at: string;
  id: number;
  message_type: string;
  role: "assistant" | "user";
  user_id: string;
};

function createMessageAdmin(rows: MessageRow[]) {
  const filters: Array<(row: MessageRow) => boolean> = [];
  let ascending = true;

  const query = {
    select() {
      return query;
    },
    eq(field: keyof MessageRow, value: unknown) {
      filters.push((row) => row[field] === value);
      return query;
    },
    in(field: keyof MessageRow, values: unknown[]) {
      filters.push((row) => values.includes(row[field]));
      return query;
    },
    gt(field: keyof MessageRow, value: unknown) {
      filters.push((row) => String(row[field]) > String(value));
      return query;
    },
    order(_field: keyof MessageRow, options?: { ascending?: boolean }) {
      ascending = options?.ascending !== false;
      return query;
    },
    limit() {
      return query;
    },
    async maybeSingle() {
      const matches = rows
        .filter((row) => filters.every((filter) => filter(row)))
        .sort((left, right) =>
          ascending ? left.id - right.id : right.id - left.id
        );
      return { data: matches[0] ?? null, error: null };
    },
  };

  return {
    from(table: string) {
      assert.equal(table, "talent_messages");
      return query;
    },
  } as unknown as TalentAdminClient;
}

const baseRows: MessageRow[] = [
  {
    conversation_id: "conversation-1",
    created_at: "2026-09-17T00:00:00.000Z",
    id: 10,
    message_type: "chat",
    role: "user",
    user_id: "user-1",
  },
  {
    conversation_id: "conversation-1",
    created_at: "2026-09-17T00:00:01.000Z",
    id: 11,
    message_type: "opportunity_feedback_note",
    role: "user",
    user_id: "user-1",
  },
  {
    conversation_id: "conversation-1",
    created_at: "2026-09-17T00:00:02.000Z",
    id: 12,
    message_type: "chat",
    role: "assistant",
    user_id: "user-1",
  },
];

test("feedback system notes do not count as user-authored chat", async () => {
  const latestId = await fetchLatestUserAuthoredChatMessageId({
    admin: createMessageAdmin(baseRows),
    conversationId: "conversation-1",
    userId: "user-1",
  });

  assert.equal(latestId, 10);
  assert.equal(
    await hasUserAuthoredChatMessageAfter({
      admin: createMessageAdmin(baseRows),
      after: "2026-09-17T00:00:00.500Z",
      conversationId: "conversation-1",
      userId: "user-1",
    }),
    false
  );
});

test("a newer user-authored chat supersedes the automatic follow-up", async () => {
  const rows = [
    ...baseRows,
    {
      conversation_id: "conversation-1",
      created_at: "2026-09-17T00:00:03.000Z",
      id: 13,
      message_type: "open_position_recommendation_request",
      role: "user" as const,
      user_id: "user-1",
    },
  ];

  assert.equal(
    await hasUserAuthoredChatMessageAfter({
      admin: createMessageAdmin(rows),
      after: "2026-09-17T00:00:01.000Z",
      conversationId: "conversation-1",
      userId: "user-1",
    }),
    true
  );
  assert.equal(
    await fetchLatestUserAuthoredChatMessageId({
      admin: createMessageAdmin(rows),
      conversationId: "conversation-1",
      userId: "user-1",
    }),
    13
  );
});
