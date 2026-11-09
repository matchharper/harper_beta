import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeOrgAgentDraftSnapshots,
  orgAgentDraftFromQueuedMessage,
  orgAgentMessageWasSaved,
  shouldHandBackOrgAgentQueue,
  type OrgAgentDraftSnapshot,
} from "@/lib/org/agent/chatQueue";
import { formatOrgMessageHoverTime } from "@/lib/org/agent/messagePresentation";
import type { OrgAgentMessage } from "@/lib/org/agent/types";

const mention = (talentId: string, displayName: string) => ({
  displayName,
  recommendationId: `rec-${talentId}`,
  roleId: "role",
  talentId,
});

test("drafts handed back join oldest first, keep each @mention in place and each file once", () => {
  const file = { id: "file-1", kind: "file" as const, file: {} as File, name: "jd.pdf", size: 10 };
  const first: OrgAgentDraftSnapshot = {
    attachments: [file],
    text: "김하나 경력 다시 봐 줘  ",
    tokens: [{ data: mention("t1", "김하나"), end: 3, id: "a", start: 0, text: "김하나" }],
  };
  const second: OrgAgentDraftSnapshot = {
    attachments: [file],
    text: "그리고 박둘도",
    tokens: [{ data: mention("t2", "박둘"), end: 6, id: "b", start: 4, text: "박둘" }],
  };
  const merged = mergeOrgAgentDraftSnapshots([first, second]);
  assert.equal(merged.text, "김하나 경력 다시 봐 줘\n\n그리고 박둘도");
  assert.deepEqual(
    merged.tokens.map((token) => merged.text.slice(token.start, token.end)),
    ["김하나", "박둘"]
  );
  assert.equal(merged.attachments.length, 1);
});

test("an empty draft adds nothing and a token that no longer matches its text is dropped", () => {
  const merged = mergeOrgAgentDraftSnapshots([
    { attachments: [], text: "   ", tokens: [] },
    {
      attachments: [],
      text: "다시 찾아 줘",
      tokens: [{ data: mention("t1", "김하나"), end: 3, id: "a", start: 0, text: "김하나" }],
    },
  ]);
  assert.equal(merged.text, "다시 찾아 줘");
  assert.deepEqual(merged.tokens, []);
});

test("only a message that never reached the conversation is handed back", () => {
  assert.equal(shouldHandBackOrgAgentQueue({ outcome: "failed_unsaved", userMessageSaved: false }), true);
  assert.equal(shouldHandBackOrgAgentQueue({ outcome: "stopped", userMessageSaved: false }), true);
  assert.equal(shouldHandBackOrgAgentQueue({ outcome: "stopped", userMessageSaved: true }), false);
  assert.equal(shouldHandBackOrgAgentQueue({ outcome: "failed_saved", userMessageSaved: true }), false);
  assert.equal(shouldHandBackOrgAgentQueue({ outcome: "completed", userMessageSaved: true }), false);
});

test("a To-do or search message without an input snapshot comes back as its text", () => {
  assert.deepEqual(
    orgAgentDraftFromQueuedMessage({ draft: null, message: "제안대로 진행해 주세요" }),
    { attachments: [], text: "제안대로 진행해 주세요", tokens: [] }
  );
});

test("a stopped send counts as saved only when the refreshed history has it", () => {
  const sentAt = "2026-11-06T13:00:00.000Z";
  const saved = (content: string, createdAt: string, id = 10): OrgAgentMessage => ({
    authorUserId: "me",
    content,
    createdAt,
    id,
    mentions: [],
    metadata: {},
    model: null,
    role: "user",
    sourceSurface: "web",
    status: "completed",
    thinkingLogs: [],
  });
  const args = { message: "외부 후보 찾아봐 ", sentAt, userId: "me" };
  assert.equal(
    orgAgentMessageWasSaved({ ...args, messages: [saved("외부 후보 찾아봐", "2026-11-06T13:00:01.000Z")] }),
    true
  );
  assert.equal(
    orgAgentMessageWasSaved({ ...args, messages: [saved("외부 후보 찾아봐", "2026-11-06T11:00:00.000Z")] }),
    false,
    "the same words from earlier in the day are a different message"
  );
  assert.equal(
    orgAgentMessageWasSaved({ ...args, messages: [saved("다른 말", "2026-11-06T13:00:01.000Z")] }),
    false
  );
  assert.equal(
    orgAgentMessageWasSaved({ ...args, messages: [saved("외부 후보 찾아봐", "2026-11-06T13:00:01.000Z", -1)] }),
    false,
    "the on-screen copy of a message being sent is not a saved one"
  );
});

test("the hover time says today, yesterday, or the date, with the clock time", () => {
  const now = new Date(2026, 10, 6, 22, 30);
  assert.equal(formatOrgMessageHoverTime(new Date(2026, 10, 6, 9, 5).toISOString(), "ko", now), "오늘 09:05");
  assert.equal(formatOrgMessageHoverTime(new Date(2026, 10, 5, 18, 40).toISOString(), "en", now), "Yesterday 18:40");
  assert.equal(formatOrgMessageHoverTime(new Date(2026, 10, 2, 14, 0).toISOString(), "ko", now), "11월 2일 14:00");
  assert.match(formatOrgMessageHoverTime(new Date(2025, 0, 2, 8, 0).toISOString(), "en", now), /2025/);
  assert.equal(formatOrgMessageHoverTime("not a date", "ko", now), "");
});
