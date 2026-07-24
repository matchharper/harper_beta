import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNoMessageContent } from "@/lib/career/noMessageContent";

const NO_MESSAGE_MARKER = "__NO_SESSION_GREETING__";

test("preserves multiline markdown for visible assistant content", () => {
  const content = [
    "반가워요.",
    "",
    "## 지금 상태",
    "",
    "- **역할 A** 확인",
    "- 역할 B 확인",
  ].join("\n");

  assert.equal(normalizeNoMessageContent(content, NO_MESSAGE_MARKER), content);
});

test("normalizes only the comparison copy when detecting the marker", () => {
  assert.equal(
    normalizeNoMessageContent(
      `“\n${NO_MESSAGE_MARKER}\n”。`,
      NO_MESSAGE_MARKER
    ),
    null
  );
});

test("keeps non-marker line breaks even when whitespace resembles the marker", () => {
  const content = `${NO_MESSAGE_MARKER}\n추가 설명`;

  assert.equal(normalizeNoMessageContent(content, NO_MESSAGE_MARKER), content);
});
