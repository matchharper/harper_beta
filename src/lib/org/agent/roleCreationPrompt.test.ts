import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleCreationOutcomePrompt,
  buildRoleCreationOutcomeSystemPrompt,
  buildRoleCreationSystemPrompt,
  ROLE_SETUP_SYSTEM_PROMPT,
  buildRoleCreationUserPrompt,
} from "@/lib/org/agent/roleCreationPrompt";

test("registered role chats edit immediately without asking to create again", () => {
  const prompt = buildRoleCreationSystemPrompt({
    editingRegisteredRole: true,
  });

  assert.match(prompt, /REGISTERED ROLE EDITING/);
  assert.match(prompt, /Do not request role-creation confirmation/);
  assert.match(
    prompt,
    /Apply facts the user supplies through the update tools/
  );
  assert.match(prompt, /Creation-only gaps are not blockers/);
});

test("Slack role creation keeps the thread linked and uses Slack mrkdwn", () => {
  const prompt = buildRoleCreationSystemPrompt({ surface: "slack" });
  assert.match(prompt, /SLACK SURFACE/);
  assert.match(prompt, /permanently linked/);
  assert.match(prompt, /\*bold\*/);
  assert.match(prompt, /server adds Create role \/ Keep editing buttons/);
  assert.match(prompt, /press a button or clearly confirm/);
});

test("one compact authoring contract retains discovery and confirmation boundaries", () => {
  const prompt = buildRoleCreationSystemPrompt();
  assert.ok(prompt.length < 17_000);
  for (const required of [
    "<company_service_core>", "<tool_outcome_response_contract>", "<hiring_brief_authoring_contract>",
    "source-preserving editing", "not a questionnaire", "actual blockers",
    "Duties and future goals", "Preferred criteria may stay empty", "breadth and strength",
    "update_role_draft.textEdits", "distinct dimensions", "criteria do not replace",
    "save onsite", "save full_time", "at least two distinct substantive opportunities",
    "read_other_roles once", "salaryRange is one free-form value", "never average or choose silently",
    "provisional role proposal",
    "calibrate_role_hiring_brief", "caliber evidence, not a candidate", "Ask at most one follow-up",
    "Translate protected traits or proxies", "availableSlackChannels is empty",
    "save email (emailEnabled=true) and the current author", "[Slack 연결하기](/org/settings)", "[Slack 채널 추가하기](/org/settings) when slackInstalled",
    "set_role_notification", "request_role_creation_confirmation", "confirm_pending_role_creation",
    "same turn", "never activates", "immediately following authorization",
  ]) assert.ok(prompt.includes(required), required);
  assert.doesNotMatch(prompt, /<professional_reference_calibration_contract>/);
  assert.doesNotMatch(prompt, /\*먼저 이렇게 등록했어요\*|\*마지막 설정\*/);
});

test("role creation and its confirmation reply use the selected web response language", () => {
  const english = buildRoleCreationSystemPrompt({ responseLocale: "en" });
  const korean = buildRoleCreationSystemPrompt({ responseLocale: "ko" });
  const outcome = buildRoleCreationOutcomeSystemPrompt("chat", "en");

  assert.match(english, /<response_language locale="en">/);
  assert.match(english, /present it as `Office`/);
  assert.match(english, /present it as `Full-time`/);
  assert.match(english, /\[Connect Slack\]\(\/org\/settings\)/);
  assert.match(korean, /present it as `대면 근무`/);
  assert.match(korean, /\[Slack 연결하기\]\(\/org\/settings\)/);
  assert.match(outcome, /<response_language locale="en">/);
});

test("Setup context contains public role facts instead of registration and private selection state", () => {
  const prompt = buildRoleCreationUserPrompt({
    view: "role_setup", responseLocale: "en", attachments: [], history: [], mentions: [], userMessage: "Write the job description.",
    state: {
      assigneeUserIds: ["private-owner"], channels: [{channelId: "private-channel"}], members: [],
      metadata: { descriptionSourceResearch: { query: "old search" } },
      role: { name: "Engineer", description: "Public duties", request: "Private selection", criteria: [{name: "private"}] },
      workspace: { companyName: "Example", pitch: "Public company", request: "Private company preference" },
    } as any,
  });
  const context = prompt.split("<ROLE_CREATION_STATE>\n")[1].split("\n</ROLE_CREATION_STATE>")[0];
  assert.match(context, /Public company/);
  assert.match(context, /Public duties/);
  assert.doesNotMatch(context, /private-owner|private-channel|Private selection|Private company preference|old search/);
});

test("keeps long pasted descriptions beyond the old twelve-thousand-character cutoff", () => {
  const tailMarker = "LONG_DESCRIPTION_TAIL_MARKER";
  const prompt = buildRoleCreationUserPrompt({
    attachments: [],
    history: [],
    mentions: [],
    state: {
      assigneeUserIds: [],
      channels: [],
      currentUser: { name: "채용 담당자" },
      members: [],
      metadata: {},
      role: { criteria: [], name: "새 역할" },
      workspace: {
        companyName: "Harper",
        pitch: null,
        relatedLinks: [],
        request: null,
      },
    } as any,
    userMessage: `${"상세 역할 설명 ".repeat(1_800)}${tailMarker}`,
  });

  assert.match(prompt, new RegExp(tailMarker));
});

test("role creation keeps 24 recent messages plus its rolling summary", () => {
  const prompt = buildRoleCreationUserPrompt({
    attachments: [],
    history: Array.from({ length: 30 }, (_, index) => ({
      content: `history-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
    })),
    mentions: [],
    olderSummary: "오래된 역할 논의 요약",
    state: {
      assigneeUserIds: [],
      channels: [],
      currentUser: { name: "채용 담당자" },
      members: [],
      metadata: {},
      role: { criteria: [], name: "Backend Engineer" },
      workspace: {
        companyName: "Harper",
        pitch: null,
        relatedLinks: [],
        request: null,
      },
    } as any,
    userMessage: "이어서 정리해 주세요.",
  });

  assert.match(prompt, /<OLDER_ROLE_CHAT_SUMMARY>/);
  assert.match(prompt, /오래된 역할 논의 요약/);
  assert.doesNotMatch(prompt, /history-6"/);
  assert.match(prompt, /history-7/);
  assert.match(prompt, /history-30/);
});

test("includes server-resolved talent mentions in role creation context", () => {
  const prompt = buildRoleCreationUserPrompt({
    attachments: [],
    history: [],
    mentions: [
      {
        displayName: "김테스트",
        recommendationId: "recommendation-1",
        roleId: "role-previous",
        talentId: "talent-1",
      },
    ],
    state: {
      assigneeUserIds: [],
      channels: [],
      currentUser: { name: "채용 담당자" },
      members: [],
      metadata: {},
      role: { name: "Founding Designer" },
      workspace: {
        brief: null,
        companyDescription: null,
        companyName: "Harper",
        pitch: "# 회사 정보 문서\n\n후보자에게 전달할 전체 회사 정보",
        relatedLinks: [],
        request: null,
      },
    } as any,
    userMessage: "@김테스트 같은 분을 찾고 싶어요.",
  });

  assert.match(prompt, /<RESOLVED_TALENT_MENTIONS>/);
  assert.match(prompt, /회사 소개 문서/);
  assert.match(prompt, /후보자에게 전달할 전체 회사 정보/);
  assert.match(prompt, /참고 링크/);
  assert.doesNotMatch(prompt, /"brief"/);
  assert.doesNotMatch(prompt, /"description":/);
  assert.match(prompt, /김테스트/);
  assert.match(prompt, /recommendation-1/);
  assert.match(prompt, /talent-1/);
});

test("criteria context exposes structural validity without a count ceiling or completion requirement", () => {
  const prompt = buildRoleCreationUserPrompt({
    attachments: [],
    history: [],
    mentions: [],
    state: {
      assigneeUserIds: [],
      channels: [],
      currentUser: { name: "채용 담당자" },
      members: [],
      metadata: {},
      role: {
        criteria: [],
        status: "draft",
        description: "후보자가 맡을 역할과 주요 업무가 정리되어 있습니다.",
        name: "Backend Engineer",
        request: "백엔드 운영 경험과 초기 팀 적응력을 중요하게 봅니다.",
      },
      workspace: {
        brief: null,
        companyDescription: null,
        companyName: "Harper",
        pitch: null,
        relatedLinks: [],
        request: null,
      },
    } as any,
    userMessage: "지금까지 내용을 정리해 주세요.",
  });

  assert.doesNotMatch(prompt, /draftRecommended|recommendedMinItems/);
  assert.match(prompt, /valid: 예/);
  assert.doesNotMatch(prompt, /requiredBeforeCompletion/);
  assert.match(prompt, /min Items: 0/);
  assert.doesNotMatch(prompt, /"maxItems"/);
});

test("writes company information as prose without a company-info marker instruction", () => {
  const prompt = buildRoleCreationSystemPrompt({ surface: "chat" });

  assert.match(prompt, /supplied JD text, URL, or file as the primary source/);
  assert.match(prompt, /begin with an accurate company introduction/);
  assert.doesNotMatch(prompt, /\[\[?company_info\]?\]/);
});

test("web Setup and its editor use the complete standalone system prompt", () => {
  for (const view of ["role_setup", "role_details"] as const) {
    assert.equal(buildRoleCreationSystemPrompt({ surface: "chat", view }), ROLE_SETUP_SYSTEM_PROMPT);
  }
});

test("a mail-only completion reply talks about email, not a missing Slack message", () => {
  const prompt = buildRoleCreationOutcomePrompt({
    missingFields: [], outcome: "completed", slackNotificationDelivered: false,
    state: {
      assigneeUserIds: ["user-a"], channels: [], emailEnabled: true,
      members: [{ userId: "user-a", name: "Alex", email: null }],
      metadata: { confirmedSlackChannelIds: [] },
      role: { name: "IR Lead", status: "active" }, workspace: { companyName: "Example" },
    } as any,
  });
  const context = prompt.split("<ROLE_CREATION_OUTCOME>\n")[1].split("\n</ROLE_CREATION_OUTCOME>")[0];
  assert.match(context, /email Enabled: 예/);
  assert.match(context, /confirmed Slack Channels: 없음/);
  assert.match(prompt, /If emailEnabled is true and confirmedSlackChannels is empty, do not mention Slack/);
});
