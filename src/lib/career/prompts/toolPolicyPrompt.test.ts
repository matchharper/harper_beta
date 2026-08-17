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

test("keeps language setting tool policy minimal", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: true,
    preferredLocale: "ko",
    toolNames: ["update_language_setting"],
  });

  assert.match(prompt, /Available tools: update_language_setting/);
  assert.match(prompt, /Exceptions available.*update_language_setting/);
  assert.doesNotMatch(prompt, /_uiStatusMessage/);
  assert.doesNotMatch(prompt, /### update_language_setting/);
});

test("defaults job search to instant and requires explicit bulk permission", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["recommend_job_postings"],
  });

  assert.match(prompt, /kind=instant.*default/);
  assert.match(prompt, /kind=bulk.*only when the user explicitly/);
  assert.match(prompt, /takes longer/);
  assert.match(prompt, /notify them by email/);
  assert.match(prompt, /max_results=15/);
  assert.match(prompt, /maximum of 20/);
});
