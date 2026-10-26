import assert from "node:assert/strict";
import test from "node:test";

import { parseCareerEndCallArguments, shouldSpeakRealtimeEndCallFallback } from "./realtimeEndCall";

test("requests a spoken fallback when end_call has no assistant text", () => {
  assert.equal(
    shouldSpeakRealtimeEndCallFallback({
      endCallRequested: true,
      responseText: "  ",
    }),
    true
  );
});

test("does not replace a closing the model already spoke", () => {
  assert.equal(
    shouldSpeakRealtimeEndCallFallback({
      endCallRequested: true,
      responseText: "답변 감사합니다. 여기서 마무리할게요.",
    }),
    false
  );
});

test("does not speak a fallback when no end_call was requested", () => {
  assert.equal(
    shouldSpeakRealtimeEndCallFallback({
      endCallRequested: false,
      responseText: "",
    }),
    false
  );
});


test("only explicit completion commands request saved onboarding completion", () => {
  assert.equal(parseCareerEndCallArguments('{"complete_onboarding":true}').completeOnboarding, true);
  for (const input of ['{}', '{"complete_onboarding":false}', '{"complete_onboarding":"true"}', 'null', 'invalid']) {
    assert.equal(parseCareerEndCallArguments(input).completeOnboarding, false);
  }
});
