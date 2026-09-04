import assert from "node:assert/strict";
import test from "node:test";

import { shouldExposeConnectedGmailTool } from "./gmailToolSelection";

test("exposes Gmail only for active post-onboarding text chat", () => {
  const active = shouldExposeConnectedGmailTool({
    channel: "chat",
    hasActiveGmailIntegration: true,
    isOnboardingDone: true,
  });
  const inactive = shouldExposeConnectedGmailTool({
    channel: "chat",
    hasActiveGmailIntegration: false,
    isOnboardingDone: true,
  });
  const onboarding = shouldExposeConnectedGmailTool({
    channel: "chat",
    hasActiveGmailIntegration: true,
    isOnboardingDone: false,
  });
  const voice = shouldExposeConnectedGmailTool({
    channel: "voice",
    hasActiveGmailIntegration: true,
    isOnboardingDone: true,
  });

  assert.equal(active, true);
  assert.equal(inactive, false);
  assert.equal(onboarding, false);
  assert.equal(voice, false);
});

test("respects an explicit Gmail tool allowlist", () => {
  const included = shouldExposeConnectedGmailTool({
    allowedToolNames: ["search_connected_gmail"],
    channel: "chat",
    hasActiveGmailIntegration: true,
    isOnboardingDone: true,
  });
  const excluded = shouldExposeConnectedGmailTool({
    allowedToolNames: ["web_search"],
    channel: "chat",
    hasActiveGmailIntegration: true,
    isOnboardingDone: true,
  });

  assert.equal(included, true);
  assert.equal(excluded, false);
});
