import assert from "node:assert/strict";
import test from "node:test";
import {
  readCareerConversationVersion,
  resolveCareerConversationVersion,
  splitCareerMessageBubbles,
} from "./conversationVersion";

test("only authorized dev choices enter source metadata and legacy turns stay professional", () => {
  assert.equal(
    resolveCareerConversationVersion("friendly", false),
    "professional"
  );
  assert.equal(resolveCareerConversationVersion("friendly", true), "friendly");
  assert.equal(
    resolveCareerConversationVersion("unknown", true),
    "professional"
  );
  assert.equal(readCareerConversationVersion(null), "professional");
  assert.equal(
    readCareerConversationVersion({ careerConversationVersion: "friendly" }),
    "friendly"
  );
});

test("stream chunks do not expose partial delimiters or unfinished content", () => {
  const content = "첫 소식![[bubble]]다음 소식ㅎㅎ";
  for (let end = 0; end < content.indexOf("다음"); end++) {
    assert.deepEqual(
      splitCareerMessageBubbles(content.slice(0, end), true),
      []
    );
  }
  assert.deepEqual(splitCareerMessageBubbles(content, true), ["첫 소식!"]);
  assert.deepEqual(splitCareerMessageBubbles(content), [
    "첫 소식!",
    "다음 소식ㅎㅎ",
  ]);
  assert.deepEqual(splitCareerMessageBubbles("[[bubble]][[bubble]]"), []);
});
