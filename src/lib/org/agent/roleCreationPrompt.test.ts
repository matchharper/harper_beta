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

test("guides adaptive role discovery without turning it into a fixed script", () => {
  const prompt = buildRoleCreationSystemPrompt();

  assert.match(prompt, /<company_service_core>/);
  assert.match(prompt, /no subscription or usage fee/);

  assert.match(
    prompt,
    /not a questionnaire, fixed script, or mandatory sequence/
  );
  assert.match(prompt, /JD text, job-posting URL, or file/);
  assert.match(prompt, /ONE-TIME DESCRIPTION SOURCE DISCOVERY/);
  assert.match(prompt, /call research_role_description_sources/);
  assert.match(prompt, /descriptionSourceResearch/);
  assert.match(prompt, /never run automatic source discovery again/);
  assert.match(prompt, /Do not use ordinary web_search as a workaround/);
  assert.match(prompt, /choose at most one/);
  assert.match(prompt, /same company's same role/);
  assert.match(prompt, /do not search again/);
  assert.match(prompt, /company's writing style, section order/);
  assert.match(prompt, /JD link, file, or pasted text/);
  assert.match(prompt, /proposal, not user-confirmed hiring truth/);
  assert.match(prompt, /single easy-to-scan grouped question/);
  assert.match(
    prompt,
    /location, employment type, work mode, compensation range/
  );
  assert.match(
    prompt,
    /compensation as optional rather than an activation blocker/
  );
  assert.match(
    prompt,
    /private matching judgment that a public JD may not contain/
  );
  assert.match(prompt, /context can remain internal and need not be published/);
  assert.match(prompt, /visited in any order, combined, revisited, or skipped/);
  assert.match(
    prompt,
    /prioritize understanding the opportunity and matching criteria/
  );
  assert.match(
    prompt,
    /Do not begin by asking the user to author structured criteria/
  );
  assert.match(prompt, /aim for 2-4 complete, non-overlapping criteria/);
  assert.match(prompt, /guidance rather than a completion requirement/);
  assert.match(prompt, /saved list may contain 0-6/);
  assert.match(prompt, /do not block role-creation confirmation/);
  assert.match(prompt, /explicitly tell the user that Harper prepared them/);
  assert.match(prompt, /not a true\/false question/);
  assert.match(prompt, /meaningfully different hiring judgment/);
  assert.match(prompt, /기술적 요구사항 충족/);
  assert.match(prompt, /Do not create separate criteria for TypeScript\/Go/);
  assert.match(prompt, /will usually need two criteria/);
  assert.match(prompt, /Compress long source material/);
  assert.match(prompt, /Missing evidence is uncertainty, not failure/);
  assert.match(prompt, /do not replace the internal role request/);
  assert.match(prompt, /optional structured-criteria draft/);
  assert.match(prompt, /at least two distinct, substantive opportunities/);
  assert.match(prompt, /NEW-DRAFT CONVERSATION CADENCE/);
  assert.match(prompt, /save onsite and present it as `대면 근무`/);
  assert.match(prompt, /save full_time and present it as `풀타임`/);
  assert.match(prompt, /혹시 위 내용 중 잘못된 내용이 있다면/);
  assert.match(prompt, /prefer one focused question per turn/);
  assert.match(prompt, /Slack channel and assignee belong at the end/);
  assert.match(prompt, /\*마지막 설정\*/);
  assert.match(prompt, /Never mention the raw channel count/);
  assert.match(prompt, /open invitation/);
  assert.match(prompt, /do not count as these two team-preference questions/);
  assert.match(prompt, /call read_other_roles/);
  assert.match(prompt, /영어 커뮤니케이션을 필수로 보셨는데/);
  assert.match(prompt, /Never let it become only a technical checklist/);
  assert.match(
    prompt,
    /only once the saved state looks ready and the required team-preference discovery/
  );
  assert.match(prompt, /short contextual “응”/);
  assert.match(prompt, /as the only tool in the turn/);
  assert.match(prompt, /do not merely acknowledge/);
  assert.match(prompt, /adds, removes, or changes role details/);
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

test("calibrates the company selection bar from one or more LinkedIn examples", () => {
  const prompt = buildRoleCreationSystemPrompt({ surface: "chat" });
  const slackPrompt = buildRoleCreationSystemPrompt({ surface: "slack" });

  assert.match(prompt, /REFERENCE-PROFILE CALIBRATION FOR A NEW DRAFT/);
  assert.match(slackPrompt, /REFERENCE-PROFILE CALIBRATION FOR A NEW DRAFT/);
  assert.match(
    prompt,
    /representative ideal profiles among current team members/
  );
  assert.match(prompt, /Phrase the invitation naturally from the conversation/);
  assert.match(prompt, /the company's caliber bar is still uncalibrated/);
  assert.match(
    prompt,
    /prioritize this invitation over another generic question/
  );
  assert.match(prompt, /Open every supplied profile URL with open_url/);
  assert.match(prompt, /professional facts actually returned by the tool/);
  assert.match(prompt, /Keep two independent gates explicit/);
  assert.match(prompt, /ROLE ELIGIBILITY \/ EXPERIENCE FIT/);
  assert.match(prompt, /COMPANY TALENT QUALITY \/ CALIBER/);
  assert.match(prompt, /Agent or domain experience/);
  assert.match(prompt, /0-to-1 experience normally belong to role fit/);
  assert.match(prompt, /Derive the company's caliber dimensions bottom-up/);
  assert.match(
    prompt,
    /Separate the user's explicit judgments from observed profile facts/
  );
  assert.match(
    prompt,
    /Top-tier schools or programs, Top-tier companies, or highly selective core teams/
  );
  assert.match(prompt, /actual program, team, and role/);
  assert.match(prompt, /exceptional independently demonstrated outcomes/);
  assert.match(prompt, /not a menu from which the user must choose/);
  assert.match(prompt, /Do not automatically erase a supported school/);
  assert.match(prompt, /generic ownership, impact, leadership, or experience/);
  assert.match(prompt, /preserve it explicitly in the provisional caliber bar/);
  assert.match(prompt, /do not declare pedigree irrelevant/);
  assert.match(prompt, /Treat one profile as a tentative anchor/);
  assert.match(
    prompt,
    /keep incidental biography and unconfirmed correlations out of the hiring bar/
  );
  assert.match(prompt, /With multiple profiles/);
  assert.match(prompt, /smallest stable set of company-specific caliber rules/);
  assert.match(prompt, /remain visible as a provisional signal/);
  assert.match(
    prompt,
    /Calibrate an interview-likelihood bar, not a similarity target/
  );
  assert.match(prompt, /still be below the company's caliber bar/);
  assert.match(
    prompt,
    /genuinely different evidence could demonstrate equivalent caliber/
  );
  assert.match(prompt, /Candidate interest cannot compensate/);
  assert.match(prompt, /merging it into update_role_draft\.request/);
  assert.match(prompt, /clearly separate sections for role eligibility/);
  assert.match(prompt, /every supported selectivity or achievement signal/);
  assert.match(
    prompt,
    /primary private calibration of the company's selection level/
  );
  assert.match(prompt, /highest-value unresolved boundary/);
  assert.match(prompt, /not about a preset menu of attributes/);
  assert.match(prompt, /Use only job-related professional evidence/);
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

  assert.match(prompt, /JD remains the primary source/);
  assert.match(prompt, /first paragraph a concise company introduction/);
  assert.match(prompt, /actual candidate-visible company introduction/);
  assert.match(prompt, /Never put it in a tool argument or saved Role field/);
  assert.match(prompt, /exact standalone marker \[\[company_info\]\]/);
  assert.match(prompt, /Do not add a separate sentence, heading, card label/);
  assert.match(
    prompt,
    /compact linked sentence "회사 정보를 작성에 참고했어요\."/
  );
  assert.match(prompt, /only when company information was actually used/);
});
