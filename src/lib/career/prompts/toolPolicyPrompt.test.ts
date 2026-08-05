import assert from "node:assert/strict";
import test from "node:test";

import { buildCareerToolPolicyPrompt } from "./toolPolicyPrompt";

test("limits profileLinks writes to the talent's own materials", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["update_talent_profile"],
  });

  assert.match(
    prompt,
    /personal LinkedIn\/GitHub\/Scholar\/portfolio\/blog\/CV/
  );
  assert.match(prompt, /Never add company, job-posting, recruiting/);
  assert.match(prompt, /do not stop at registration confirmation/);
  assert.match(prompt, /improve future opportunity matching/);
  assert.doesNotMatch(prompt, /consent/i);
  assert.match(prompt, /will no longer use it as a saved source/);
});
