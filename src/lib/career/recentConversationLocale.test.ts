import assert from "node:assert/strict";
import test from "node:test";

import { resolveCareerRecentConversationLocale } from "./recentConversationLocale";

test("recent explicit English switch overrides the account locale", () => {
  assert.equal(
    resolveCareerRecentConversationLocale({
      fallbackLocale: "ko",
      messages: [
        { content: "계속 이야기해요.", role: "user" },
        {
          content: "Hi, can we have a conversation in English?",
          role: "user",
        },
        { content: "Of course.", role: "assistant" },
        { content: "Just continue the conversation.", role: "user" },
      ],
    }),
    "en"
  );
});

test("the latest explicit switch wins", () => {
  assert.equal(
    resolveCareerRecentConversationLocale({
      fallbackLocale: "ko",
      messages: [
        { content: "Please reply in English.", role: "user" },
        { content: "이제 한국어로 답변해 주세요.", role: "user" },
      ],
    }),
    "ko"
  );
});

test("ordinary language mentions do not override the account locale", () => {
  assert.equal(
    resolveCareerRecentConversationLocale({
      fallbackLocale: "ko",
      messages: [
        { content: "영어 사용이 많은 역할도 괜찮아요.", role: "user" },
      ],
    }),
    "ko"
  );
});
