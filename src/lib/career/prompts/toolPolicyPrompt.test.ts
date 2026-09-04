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

test("matched internal role policy describes already-reviewed fit roles", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: [
      "get_internal_roles",
      "get_role_context",
      "internal_role_priority_review",
      "update_recommended_opportunity_feedback",
    ],
  });

  assert.match(prompt, /matchedOnly=true/);
  assert.match(prompt, /already been reviewed and assessed as a fit/);
  assert.match(prompt, /private selection context/);
  assert.match(prompt, /not yet roles to explain or render as posting cards/);
  assert.match(prompt, /feedback=`review`/);
  assert.match(prompt, /review alongside the current one/);
  assert.match(prompt, /does not accept it, close another role, rerun fit/);
  assert.doesNotMatch(prompt, /sourceRoleId|replacesRoleId/);
  assert.match(
    prompt,
    /use feedback=`like` only when the user later explicitly accepts/
  );
  assert.match(
    prompt,
    /one to three concise candidate-visible fitReasons/
  );
  assert.match(prompt, /reason=internal_role_review_required/);
  assert.match(prompt, /never include private company requests/);
  assert.match(prompt, /records the user's priority-review request/);
  assert.match(prompt, /even when the role also has stored fit/);
  assert.match(prompt, /asks to add it to Positions\/Jobs/);
  assert.match(prompt, /prioritize a role is not `feedback=review`/);
  assert.match(prompt, /asking '더 있어\?'/);
  assert.match(prompt, /not to enumerate or explain every unpresented role/);
  assert.match(prompt, /only after feedback=`review` has made it a formal recommendation/);
  assert.doesNotMatch(
    prompt,
    /If user wants listing all, say it's not possible/
  );
});

test("document tools use paginated metadata, bounded reads, and soft delete", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["list_documents", "read_document", "update_document"],
  });

  assert.match(prompt, /offset=0 and limit=10/);
  assert.match(prompt, /metadata-only/);
  assert.match(prompt, /content_excerpt.*next_offset/);
  assert.match(prompt, /earlier saved document.*offset=0/);
  assert.match(prompt, /max_chars=4000/);
  assert.match(prompt, /continue from nextOffset/);
  assert.match(prompt, /binary-only file may have textAvailable=false/);
  assert.match(prompt, /is_deleted=true is a soft delete only/);
  assert.match(prompt, /transient third-party reference material/);
});
