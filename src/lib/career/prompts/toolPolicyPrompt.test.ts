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
  assert.match(prompt, /does not change the default or grant sharing consent/);
});

test("routes explicit name corrections to the profile without rewriting them", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["update_talent_profile"],
  });

  assert.match(prompt, /talentUser\.name/);
  assert.match(prompt, /copy it exactly as written/);
  assert.match(prompt, /without translation or transliteration/);
});

test("keeps language setting tool policy minimal", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: true,
    preferredLocale: "ko",
    toolNames: ["update_language_setting"],
  });

  assert.match(prompt, /Callable tools in this response: update_language_setting/);
  assert.match(prompt, /Exceptions available.*update_language_setting/);
  assert.doesNotMatch(prompt, /_uiStatusMessage/);
  assert.doesNotMatch(prompt, /### update_language_setting/);
});

test("chat allows useful findings while keeping execution instructions in tool calls", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["write_talent_context"],
  });

  assert.match(prompt, /may speak before or between tool calls/);
  assert.match(prompt, /without repeating acknowledgements/);
  assert.match(prompt, /Execution instructions and safeguards belong in the tool call/);
  assert.match(prompt, /Continue delegated work and ask when an essential answer is needed/);
  assert.match(prompt, /conversation and explanations to the candidate in Korean/);
  assert.match(prompt, /Thinking log sentence in Korean/);
  assert.doesNotMatch(prompt, /call it before writing user-visible explanation/);
  assert.doesNotMatch(prompt, /specific English user-facing Thinking log/);
  assert.doesNotMatch(prompt, /start with brief acknowledgement/);
});

test("career context updates keep Brief labels aligned with their content", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["write_talent_context"],
  });

  assert.match(prompt, /Brief update makes its current label misleading/);
  assert.match(prompt, /update the label in the same change/);
  assert.match(prompt, /independently understandable and updatable topic/);
  assert.match(prompt, /linked conditions, trade-offs, and exceptions/);
  assert.match(prompt, /Save only facts the user stated/);
  assert.match(prompt, /do not repeat its label in content/);
});

test("writes changed criteria before starting a recommendation run", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["write_talent_context", "search_opportunities"],
  });

  assert.match(prompt, /write the context change first/);
  assert.match(prompt, /correct complete criteria snapshot/);
});

test("internal role discovery, review publication and introduction consent stay separate", () => {
  const prompt = buildCareerToolPolicyPrompt({ channel: "chat", toolNames: ["get_internal_roles", "get_role_context", "apply_to_internal_role", "update_recommended_opportunity_feedback"] });
  assert.match(prompt, /apply_to_internal_role/);
  assert.match(prompt, /after the candidate has reviewed the Role and chosen introduction/);
  assert.match(prompt, /initial review request is not introduction acceptance/);
  assert.doesNotMatch(prompt, /internal_role_priority_review|feedback=`review`|not yet roles to explain/);
});

test("document tools use paginated metadata, bounded reads, and soft delete", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["list_documents", "read_document", "upsert_document"],
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

test("unified document policy includes native actions and loads resume guidance on demand", () => {
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    toolNames: ["list_documents", "read_document", "upsert_document"],
  });
  assert.match(prompt, /type=resume.*type=markdown/);
  assert.match(prompt, /Create needs type and title/);
  assert.match(prompt, /copy makes a separate named private document/);
  assert.match(prompt, /Metadata-only update may omit type and body fields/);
  assert.match(prompt, /cannot convert an existing document in place/);
  assert.match(prompt, /load_handbook\("resume"\)/);
  assert.match(prompt, /Read the current document before edits/);
  assert.match(prompt, /stable entry IDs and the current revision/);
  assert.match(prompt, /Preserve unrelated content for scoped edits/);
  assert.match(prompt, /Both support PDF download/);
  assert.doesNotMatch(prompt, /generate_resume/);
});

test("legacy application flags do not change the general document writer or restore phase tools", () => {
  const toolNames = ["list_documents", "read_document", "upsert_document"];
  const prompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    applicationPreparation: true,
    toolNames,
  });
  assert.equal(prompt, buildCareerToolPolicyPrompt({ channel: "chat", toolNames }));
  assert.match(prompt, /upsert_document creates, updates or privately copies resumes and Markdown documents/);
  assert.doesNotMatch(prompt, /ready_for_role|Application resume commands|generate_resume|### Resume creation and revision/);
});

test("adds Gmail truthfulness rules only when the Gmail tool is present", () => {
  const gmailPrompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["search_connected_gmail"],
  });
  const noGmailPrompt = buildCareerToolPolicyPrompt({
    channel: "chat",
    isOnboardingActive: false,
    preferredLocale: "ko",
    toolNames: ["web_search"],
  });

  assert.match(gmailPrompt, /actual inbox/);
  assert.match(gmailPrompt, /status=ok/);
  assert.match(gmailPrompt, /Never invent inbox findings/);
  assert.doesNotMatch(noGmailPrompt, /search_connected_gmail/);
  assert.doesNotMatch(noGmailPrompt, /actual inbox/);
});
