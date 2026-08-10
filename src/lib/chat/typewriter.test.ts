import assert from "node:assert/strict";
import test from "node:test";

import { splitChatTextDeltaForReveal } from "@/lib/chat/progressiveText";
import { buildChatTypewriterChunks } from "@/lib/chat/typewriter";

test("shared chat typewriter preserves Markdown and whitespace exactly", () => {
  const markdown =
    "## 제목\n\n**굵은 문장**과 [링크](https://example.com)를 함께 보여줍니다.\n- 첫 번째\n- 두 번째";
  const chunks = buildChatTypewriterChunks(markdown);

  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), markdown);
});

test("progressive reveal keeps normal SSE deltas and splits coalesced frames", () => {
  const shortDelta = "짧은 streaming delta";
  assert.deepEqual(splitChatTextDeltaForReveal(shortDelta), [shortDelta]);

  const coalescedDelta =
    "한 번의 네트워크 프레임에 합쳐진 긴 답변도 전체 문장과 Markdown 문자를 잃지 않고 여러 화면 갱신으로 나뉘어야 합니다. **중요한 내용**도 그대로 유지합니다.";
  const chunks = splitChatTextDeltaForReveal(coalescedDelta);

  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), coalescedDelta);
});
