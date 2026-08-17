import assert from "node:assert/strict";
import test from "node:test";

import { formatTalentMessageContentForLlmPrompt } from "./opportunityFeedbackNote";

test("strips opportunity run metadata before adding a message to an LLM prompt", () => {
  const formatted = formatTalentMessageContentForLlmPrompt({
    content: [
      "검색을 접수했어요.",
      "",
      "[opportunity_run](/career?opportunityRunId=00000000-0000-4000-8000-000000000001&relation=accepted)",
    ].join("\n"),
    messageType: "chat",
  });

  assert.equal(formatted, "검색을 접수했어요.");
});
