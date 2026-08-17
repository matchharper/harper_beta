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
  assert.match(prompt, /server adds Slack choice buttons/);
  assert.match(prompt, /press a button or clearly confirm/);
});

test("guides adaptive role discovery without turning it into a fixed script", () => {
  const prompt = buildRoleCreationSystemPrompt();

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
  assert.match(prompt, /open invitation/);
  assert.match(prompt, /do not count as these two team-preference questions/);
  assert.match(prompt, /call read_other_roles/);
  assert.match(prompt, /영어 커뮤니케이션을 필수로 보셨는데/);
  assert.match(prompt, /Never let it become only a technical checklist/);
  assert.match(prompt, /only once the saved state looks ready and the required team-preference discovery/);
  assert.match(prompt, /short contextual “응”/);
  assert.match(prompt, /as the only tool in the turn/);
  assert.match(prompt, /do not merely acknowledge/);
  assert.match(prompt, /adds, removes, or changes role details/);
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
