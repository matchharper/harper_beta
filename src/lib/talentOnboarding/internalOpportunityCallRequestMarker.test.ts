import assert from "node:assert/strict";
import test from "node:test";

import { replaceReengagementCallLinkWithCardMarker } from "./internalOpportunityCallMarker";

test("replaces the LLM call link with the durable call-card marker", () => {
  const content = replaceReengagementCallLinkWithCardMarker({
    content: "편하실 때 이야기 나눠도 좋아요. [call](callId:call-123)",
    payload: {
      callId: "call-123",
      companyName: "Acme",
      resumePromptNeeded: false,
      roleTitle: "Backend Engineer",
    },
  });

  assert.match(content, /편하실 때 이야기 나눠도 좋아요\./);
  assert.doesNotMatch(content, /\[call\]\(callId:/);
  assert.match(content, /\[\[INTERNAL_OPPORTUNITY_CALL_REQUEST:/);
  assert.match(content, /%22callId%22%3A%22call-123%22/);
});
