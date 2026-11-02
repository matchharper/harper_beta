import assert from "node:assert/strict";
import test from "node:test";
import { readCareerConversationTextChatModel } from "./conversationTextChatModel.server";
import { DEFAULT_CAREER_TEXT_CHAT_MODEL } from "./textChatModelConfig";

test("server-generated replies reuse only this owner's conversation choice and default when none exists", async () => {
  for (const payload of [null, {}, { careerTextChatModel: "claude-sonnet-5-5" }]) {
    const filters: unknown[] = [];
    const query: any = {
      select: () => query,
      eq: (key: string, value: string) => { filters.push([key, value]); return query; },
      not: () => query,
      order: (key: string, options: unknown) => { filters.push([key, options]); return query; },
      limit: () => query,
      maybeSingle: async () => ({ data: payload ? { payload } : null, error: null }),
    };
    const result = await readCareerConversationTextChatModel({ admin: { from: () => query } as any, userId: "owner", conversationId: "conversation" });
    assert.equal(result.model, payload && "careerTextChatModel" in payload ? payload.careerTextChatModel : DEFAULT_CAREER_TEXT_CHAT_MODEL);
    assert.deepEqual(filters, [["user_id", "owner"], ["conversation_id", "conversation"], ["id", { ascending: false }]]);
  }
});
