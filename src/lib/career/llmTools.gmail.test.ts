import assert from "node:assert/strict";
import test from "node:test";

import { GMAIL_DISCONNECTED_TOOL_DESCRIPTION, shouldExposeConnectedGmailTool, withCareerGmailConnectionDescription } from "./gmailToolSelection";

test("exposes Gmail in post-onboarding text chat even without a connection", () => {
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
  assert.equal(inactive, true);
  assert.equal(onboarding, false);
  assert.equal(voice, false);
});

test("Gmail descriptions append connection state without mutating shared schemas", () => {
  for (const name of ["search_connected_gmail", "write_email"]) {
    const tool = { function: { name, description: "Original tool contract." } };
    const disconnected = withCareerGmailConnectionDescription(tool, false);
    assert.equal(disconnected.function.description, `Original tool contract.\n\n${GMAIL_DISCONNECTED_TOOL_DESCRIPTION}`);
    assert.equal(tool.function.description, "Original tool contract.");
    assert.deepEqual(withCareerGmailConnectionDescription(disconnected, false), disconnected);
    assert.deepEqual(withCareerGmailConnectionDescription(disconnected, true), tool);
    assert.deepEqual(withCareerGmailConnectionDescription(tool, true), tool);
  }
  const other = { function: { name: "web_search", description: "Web search." } };
  assert.equal(withCareerGmailConnectionDescription(other, false), other);
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
