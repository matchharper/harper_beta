import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCareerConversationPromptPlan } from "@/lib/career/prompts";
import { CAREER_HARPER_LINK_OUTPUT_RULE } from "@/lib/career/prompts/rawPrompts";
import { adaptEmailPromptBlocks } from "./prompt";

test("email adapts channel instructions without mutating the web prompt or its data", () => {
  const args = {
    channel: "chat" as const,
    profile: { current_location: "서울" },
    structuredProfileText: "RowID: x\nProfile facts preserved",
    talentContextSection: "[1] 근무 지역: 서울 또는 원격",
    isOnboardingDone: true,
    currentPreferences: { preferredLocale: "ko" },
    toolNames: ["write_talent_context", "contact_company"],
  };
  const web = buildCareerConversationPromptPlan(args);
  const original = JSON.stringify(web);
  const email = adaptEmailPromptBlocks(web.promptBlocks, {
    subject: "Re: 기회",
    thread: "Earlier reply — not consent",
    attachments: [],
  });
  assert.equal(JSON.stringify(web), original);
  const text = email.map((b) => b.text).join("\n");
  assert.match(text, /communicating through Email/);
  assert.doesNotMatch(text, /CAREER_CHOICE_BUTTONS/);
  assert.ok(!text.includes(CAREER_HARPER_LINK_OUTPUT_RULE));
  assert.ok(!email.some((b) => b.key === "mock_interview_offer"));
  for (const key of ["future_matching_insights", "tool_policy"]) {
    assert.equal(
      email.find((b) => b.key === key)?.text,
      web.promptBlocks.find((b) => b.key === key)?.text
    );
  }
  assert.match(text, /Profile facts preserved/);
  assert.match(text, /서울 또는 원격/);
});

test("email projects setting labels and omits generic enrichment without losing role clarification or facts", () => {
  const blocks = [
    {
      key: "core_response_guidance",
      text: "## Asking questions\ngeneric enrichment\n## Connection consent\nrequired confirmation",
    },
    {
      key: "profile_context",
      text: "Resume status: (none) - web enrichment nudge\n- Profile visibility: Open to matches\nDescription: Open to matches is a user's quoted text.",
    },
    {
      key: "dynamic_state",
      text: "## Optional follow-up opportunities\n### Priority 1: Internal opportunity clarification\nfitId: preserved\n### Priority 2: Resume/profile context request\nupload nudge\n### Priority 3: General question opportunities\nexperience nudge\n## Pending confirmation\nconsent preserved",
    },
  ];
  const before = JSON.stringify(blocks);
  const email = adaptEmailPromptBlocks(blocks, {
    subject: "",
    thread: "",
    attachments: [],
  });
  assert.equal(JSON.stringify(blocks), before);
  const profile = email.find((b) => b.key === "profile_context")!.text;
  assert.match(profile, /프로필을 검토/);
  assert.match(profile, /Legacy resume profile metadata: not recorded/);
  assert.match(profile, /use list_documents to read owned files/);
  assert.doesNotMatch(profile, /web enrichment nudge/);
  assert.match(profile, /Description: Open to matches is a user's quoted text/);
  const dynamic = email.find((b) => b.key === "dynamic_state")!.text;
  assert.match(dynamic, /fitId: preserved/);
  assert.match(dynamic, /consent preserved/);
  assert.doesNotMatch(dynamic, /upload nudge|experience nudge/);
  const guidance = email.find((b) => b.key === "core_response_guidance")!.text;
  assert.match(guidance, /required confirmation/);
  assert.doesNotMatch(guidance, /generic enrichment/);
});
