import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleCreationSystemPrompt,
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

test("guides compact adaptive role discovery without a fixed script", () => {
  const prompt = buildRoleCreationSystemPrompt();

  assert.ok(prompt.length < 24_000);
  assert.match(prompt, /<company_service_core>/);
  assert.match(prompt, /## Tool Response Guidance/);
  assert.match(prompt, /not a questionnaire, fixed script, or mandatory sequence/);
  assert.match(prompt, /server result identifies actual blockers/);

  assert.match(prompt, /substantial supplied JD text, URL, or file as the primary source/);
  assert.match(prompt, /begin with an accurate company introduction/);
  assert.match(prompt, /never \[\[company_info\]\] or a placeholder/);
  assert.match(prompt, /standalone \[\[company_info\]\] marker only in the user-facing reply/);
  assert.match(prompt, /Preserve an existing registered Role's structure during partial edits/);

  assert.match(prompt, /compensation and Evaluation Criteria are optional/i);
  assert.match(prompt, /0–6 are valid/);
  assert.match(prompt, /Group related technologies.*one technical-fit dimension/);
  assert.match(prompt, /treat missing evidence as uncertainty rather than failure/);
  assert.match(prompt, /criteria do not replace/);
  assert.match(prompt, /Translate vague traits into observable capabilities/);
  assert.match(prompt, /<hiring_brief_authoring_contract>/);
  assert.match(prompt, /Never erase an established school bar/);
  assert.match(prompt, /not an automatic preferred-company list/);

  assert.match(prompt, /NEW-DRAFT CONVERSATION CADENCE/);
  assert.match(prompt, /save onsite and present it as `대면 근무`/);
  assert.match(prompt, /save full_time and present it as `풀타임`/);
  assert.match(prompt, /혹시 위 내용 중 잘못된 내용이 있다면/);
  assert.match(prompt, /Slack channel and assignee belong at the end/);
  assert.match(prompt, /\*마지막 설정\*/);
  assert.match(prompt, /Never mention the raw channel count/);

  assert.match(prompt, /OPTIONAL COMPENSATION CHECKPOINT FOR A NEW DRAFT/);
  assert.match(prompt, /ask at most once/);
  assert.match(prompt, /genuinely analogous company Roles/);
  assert.match(prompt, /never average or choose silently/);
  assert.match(prompt, /salaryRange is one free-form value/);
  assert.match(prompt, /never split, infer, convert, normalize, or silently copy/);

  assert.match(prompt, /ONE-TIME DESCRIPTION SOURCE DISCOVERY/);
  assert.match(prompt, /descriptionSourceResearch is the durable one-attempt marker/);
  assert.match(prompt, /choose at most one result clearly matching/);
  assert.match(prompt, /Never combine postings or borrow another company's content/);
  assert.match(prompt, /Treat this draft as a proposal/);

  assert.match(prompt, /REQUIRED TEAM-PREFERENCE DISCOVERY/);
  assert.match(prompt, /at least two distinct substantive opportunities/);
  assert.match(prompt, /One must be an open invitation/);
  assert.match(prompt, /JD facts, technical requirements.*do not count/);
  assert.match(prompt, /read_other_roles once/);

  assert.match(prompt, /REFERENCE-PROFILE CALIBRATION/);
  assert.match(prompt, /current team members/);
  assert.match(prompt, /call calibrate_role_hiring_brief/);
  assert.match(prompt, /Treat the person as caliber evidence, not a candidate/);
  assert.match(prompt, /Ask at most one follow-up/);

  assert.match(prompt, /CONVERSATION AND EVIDENCE/);
  assert.match(prompt, /Translate protected traits or proxies/);
  assert.match(prompt, /SLACK AND ASSIGNEE/);
  assert.match(prompt, /\[Slack 연결하기\]\(\/org\/settings\)/);
  assert.match(prompt, /request_role_creation_confirmation/);
  assert.match(prompt, /confirm_pending_role_creation/);
  assert.match(prompt, /short contextual “응”/);
  assert.match(prompt, /do not merely acknowledge/);
});

test("requires a settings link when no Slack channel is available", () => {
  const prompt = buildRoleCreationSystemPrompt({ surface: "chat" });

  assert.match(prompt, /availableSlackChannels.*is empty/);
  assert.match(prompt, /do not imply that Slack is optional/);
  assert.match(prompt, /role cannot be registered until Slack is connected/);
  assert.match(prompt, /\[Slack 연결하기\]\(\/org\/settings\)/);
  assert.match(prompt, /return once Slack and a channel are connected/);
  assert.match(prompt, /Do not request final role-creation confirmation/);
});

test("calibrates the company selection bar from professional references", () => {
  const prompt = buildRoleCreationSystemPrompt({ surface: "chat" });
  const slackPrompt = buildRoleCreationSystemPrompt({ surface: "slack" });

  for (const value of [prompt, slackPrompt]) {
    assert.match(value, /REFERENCE-PROFILE CALIBRATION FOR A NEW DRAFT/);
    assert.match(value, /real professional references/);
    assert.match(value, /current team members/);
    assert.match(value, /LinkedIn\/GitHub/);
    assert.match(value, /resolved internal mention/);
    assert.match(value, /prioritize this over another generic trait question/);
    assert.match(value, /call calibrate_role_hiring_brief/);
    assert.match(value, /caliber evidence, not a candidate/);
    assert.match(value, /non-exclusive, professional peer-group signals/);
    assert.match(value, /user-stated reasons are strongest/);
    assert.match(value, /Ask at most one follow-up/);
  }
  assert.doesNotMatch(prompt, /gpt-5\.6-terra|pre-open sources|another model/i);
});

test("includes the durable one-attempt source-research marker in role state", () => {
  const prompt = buildRoleCreationUserPrompt({
    attachments: [],
    history: [],
    mentions: [],
    state: {
      assigneeUserIds: [],
      channels: [],
      currentUser: { name: "채용 담당자" },
      members: [],
      metadata: {
        descriptionSourceResearch: {
          attemptedAt: "2026-08-17T00:00:00.000Z",
          query: "Harper Founding Designer 채용 career",
          resultCount: 0,
          selectedSourceUrl: null,
          source: "role_creation_chat",
          status: "completed",
        },
      },
      role: { criteria: [], name: "Founding Designer" },
      workspace: {
        companyName: "Harper",
        pitch: "# Harper",
        relatedLinks: [],
        request: null,
      },
    } as any,
    userMessage: "다음 내용을 정리해 주세요.",
  });

  assert.match(prompt, /"descriptionSourceResearch"/);
  assert.match(prompt, /Harper Founding Designer 채용 career/);
  assert.match(prompt, /"resultCount": 0/);
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
  assert.match(prompt, /"companyInformationDocument"/);
  assert.match(prompt, /후보자에게 전달할 전체 회사 정보/);
  assert.match(prompt, /"relatedLinks"/);
  assert.doesNotMatch(prompt, /"brief"/);
  assert.doesNotMatch(prompt, /"description":/);
  assert.match(prompt, /김테스트/);
  assert.match(prompt, /recommendation-1/);
  assert.match(prompt, /talent-1/);
});

test("signals when Harper should proactively draft structured criteria", () => {
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

  assert.match(prompt, /"draftRecommended": true/);
  assert.match(prompt, /"valid": true/);
  assert.match(prompt, /"requiredBeforeCompletion": false/);
  assert.match(prompt, /"minItems": 0/);
  assert.match(prompt, /"recommendedMinItems": 2/);
  assert.match(prompt, /"maxItems": 6/);
});

test("writes company information as prose and keeps its marker out of saved fields", () => {
  const prompt = buildRoleCreationSystemPrompt({ surface: "chat" });

  assert.match(prompt, /supplied JD text, URL, or file as the primary source/);
  assert.match(prompt, /begin with an accurate company introduction/);
  assert.match(prompt, /Description must contain the real prose/);
  assert.match(prompt, /standalone \[\[company_info\]\] marker only in the user-facing reply/);
  assert.match(prompt, /never save or explain the marker/);
  assert.match(prompt, /Omit it when company information was unused or unavailable/);
});
