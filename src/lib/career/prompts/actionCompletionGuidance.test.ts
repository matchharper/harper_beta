import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_CORE_RESPONSE_GUIDANCE_PROMPT,
  CAREER_CORE_RESPONSE_GUIDANCE_PROMPT_FOR_ONBOARDING_CALL,
} from "./rawPrompts";

// Contract tests inspect the authored prompt, never classify model responses.
test("ordinary chat follows the current request instead of forcing a counseling intent bucket", () => {
  assert.match(CAREER_CORE_RESPONSE_GUIDANCE_PROMPT, /actual request and verified tool outcomes/);
  assert.match(CAREER_CORE_RESPONSE_GUIDANCE_PROMPT, /communication content, not automatically a request for advice/);
  assert.doesNotMatch(CAREER_CORE_RESPONSE_GUIDANCE_PROMPT, /silently classify|First give career-relevant guidance/);
  assert.match(CAREER_CORE_RESPONSE_GUIDANCE_PROMPT, /When the candidate wants help thinking through a career concern/);
});

test("completion does not invent another actor's reaction or a future action", () => {
  assert.match(CAREER_CORE_RESPONSE_GUIDANCE_PROMPT, /predicted company reaction/);
  assert.match(CAREER_CORE_RESPONSE_GUIDANCE_PROMPT, /future upload or reply does not by itself authorize promising another delivery/);
  assert.match(CAREER_CORE_RESPONSE_GUIDANCE_PROMPT, /A short completion reply is sufficient/);
});

test("onboarding keeps its separate existing guidance", () => {
  assert.match(CAREER_CORE_RESPONSE_GUIDANCE_PROMPT_FOR_ONBOARDING_CALL, /silently classify/);
  assert.doesNotMatch(CAREER_CORE_RESPONSE_GUIDANCE_PROMPT_FOR_ONBOARDING_CALL, /predicted company reaction/);
});
