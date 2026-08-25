import assert from "node:assert/strict";
import test from "node:test";
import {
  attachAutoIntroSlackReviewAction,
  AUTO_INTRO_SLACK_REVIEW_ACTION_ID,
  buildAutoIntroCandidateNameLink,
  buildAutoIntroCandidateProfileUrl,
  buildAutoIntroRoleJobsUrl,
  buildAutoIntroRoleSummarySlackBlocks,
  buildAutoIntroRoleSummaryText,
  buildAutoIntroWorkspaceActionGuidance,
  buildAutoIntroWorkspaceJobsUrl,
  groupAutoIntroItemsByWorkspaceAndRole,
  renderAutoIntroCandidateCopy,
  renderAutoIntroSlackProfile,
  validateAutoIntroCandidateSentences,
  validateAutoIntroInternalReason,
} from "./autoIntroToCompanyMessage";
import {
  AUTO_INTRO_RESPONSE_GUIDANCE,
  AUTO_INTRO_WORKSPACE_OPENING,
} from "./autoIntroToCompanyPolicy";

const LINK_ARGS = {
  publicSiteUrl: "http://localhost:3000",
  recommendationId: "recommendation-1",
  roleId: "role-1",
  talentId: "talent-1",
  workspaceId: "workspace-1",
};

test("candidate profile URL opens the org pipeline detail", () => {
  const url = new URL(buildAutoIntroCandidateProfileUrl(LINK_ARGS));
  assert.equal(url.origin, "http://localhost:3000");
  assert.equal(url.pathname, "/org/role");
  assert.equal(url.searchParams.get("orgId"), "workspace-1");
  assert.equal(url.searchParams.get("roleId"), "role-1");
  assert.equal(url.searchParams.get("tab"), "pipeline");
  assert.equal(url.searchParams.get("view"), "pipeline");
  assert.equal(url.searchParams.get("talentId"), "talent-1");
  assert.equal(url.searchParams.get("recommendationId"), "recommendation-1");
  assert.equal(url.searchParams.get("detailRoleId"), "role-1");
  assert.equal(url.searchParams.get("detailWorkspaceId"), "workspace-1");
});

test("candidate name stays linked when recommendation ID is missing", () => {
  const url = new URL(
    buildAutoIntroCandidateProfileUrl({
      ...LINK_ARGS,
      recommendationId: null,
    })
  );
  assert.equal(url.searchParams.has("recommendationId"), false);
  assert.equal(url.searchParams.get("talentId"), "talent-1");
});

test("Slack candidate name link escapes the label", () => {
  const link = buildAutoIntroCandidateNameLink({
    ...LINK_ARGS,
    name: "Kim | R&D",
  });
  assert.match(link, /^<http:\/\/localhost:3000\/org\/role\?/);
  assert.ok(link.endsWith("|Kim &#124; R&amp;D>"));
});

test("workspace action guidance links to the org jobs overview once", () => {
  const url = new URL(
    buildAutoIntroWorkspaceJobsUrl({
      publicSiteUrl: "http://localhost:3000",
      workspaceId: "workspace-1",
    })
  );
  assert.equal(url.origin, "http://localhost:3000");
  assert.equal(url.pathname, "/org/jobs");
  assert.equal(url.searchParams.get("orgId"), "workspace-1");
  assert.equal(url.searchParams.get("roleId"), "all");
  const guidance = buildAutoIntroWorkspaceActionGuidance({
    publicSiteUrl: "http://localhost:3000",
    workspaceId: "workspace-1",
  });
  assert.match(guidance, /<http:\/\/localhost:3000\/org\/jobs\?/);
  assert.match(guidance, /후보자에 대한 더 자세한 정보/);
  assert.match(guidance, /Harper 웹에서 확인해 주세요/);
  assert.equal((guidance.match(/<http/g) ?? []).length, 1);
});

test("new candidate guidance uses natural Slack language instead of web button labels", () => {
  assert.deepEqual(AUTO_INTRO_WORKSPACE_OPENING, [
    "*연결을 제안드리고 싶은 후보자가 있습니다.*",
  ]);
  assert.match(AUTO_INTRO_RESPONSE_GUIDANCE, /천천히 확인/);
  assert.match(
    AUTO_INTRO_RESPONSE_GUIDANCE,
    /연결을 받으실지, 거절하실지 선택해 주세요/
  );
  assert.match(AUTO_INTRO_RESPONSE_GUIDANCE, /연결을 수락하면 .*대화를 직접/);
  assert.match(AUTO_INTRO_RESPONSE_GUIDANCE, /거절시 .*후보자에게 .*안내/);
  assert.match(
    AUTO_INTRO_RESPONSE_GUIDANCE,
    /다음에는 .*더 정확하게 찾아볼게요/
  );
  assert.doesNotMatch(AUTO_INTRO_RESPONSE_GUIDANCE, /Connect|Reject/);
});

test("role summary uses a native Slack table with exact role links", () => {
  const summary = {
    companyName: "Wonderful",
    roles: [
      {
        pendingDecisionCount: 5,
        roleId: "6da0a19e-b4b5-533e-92b4-598f3666969f",
        roleTitle: "FDE (Forward Deployed Engineer)",
        status: "active",
        workspaceId: "f2e80aee-fee3-40f5-807f-5f8694c37eee",
      },
    ],
    workspaceId: "f2e80aee-fee3-40f5-807f-5f8694c37eee",
  };
  const expectedUrl =
    "https://matchharper.com/org/role?orgId=f2e80aee-fee3-40f5-807f-5f8694c37eee&roleId=6da0a19e-b4b5-533e-92b4-598f3666969f&tab=pipeline&view=pipeline";
  assert.equal(
    buildAutoIntroRoleJobsUrl({
      roleId: summary.roles[0].roleId,
      workspaceId: summary.workspaceId,
    }),
    expectedUrl
  );
  const text = buildAutoIntroRoleSummaryText({ summary });
  assert.match(
    text,
    /^\*현재 채용 현황\*\n현재 연결 여부를 결정해야 하는 후보자를 정리했습니다\./
  );
  assert.match(text, /FDE \(Forward Deployed Engineer\)> \| 진행 중 \| 5명/);
  const blocks = buildAutoIntroRoleSummarySlackBlocks({ summary });
  assert.deepEqual(blocks[0], {
    text: {
      text: "*현재 채용 현황*\n현재 연결 여부를 결정해야 하는 후보자를 정리했습니다.",
      type: "mrkdwn",
    },
    type: "section",
  });
  const table = blocks.find((block) => block.type === "table") as {
    rows: Array<Array<Record<string, unknown>>>;
  };
  assert.ok(table);
  assert.equal(table.rows.length, 2);
  const roleCell = table.rows[1]?.[0] as {
    elements: Array<{ elements: Array<{ type: string; url: string }> }>;
  };
  assert.equal(roleCell.elements[0]?.elements[0]?.type, "link");
  assert.equal(roleCell.elements[0]?.elements[0]?.url, expectedUrl);
  assert.deepEqual(table.rows[1]?.[2], {
    text: "5명",
    type: "raw_text",
  });
});

test("auto intro Slack review action is appended once for the sent candidate batch", () => {
  const blocks = attachAutoIntroSlackReviewAction({
    candidateCount: 7,
    messageBody: "후보자 소개 본문",
  });
  const actionBlocks = blocks.filter(
    (block) => block.type === "actions"
  ) as Array<{
    elements: Array<{ action_id: string; text: { text: string } }>;
  }>;
  assert.equal(actionBlocks.length, 1);
  assert.equal(
    actionBlocks[0]?.elements[0]?.action_id,
    AUTO_INTRO_SLACK_REVIEW_ACTION_ID
  );
  assert.equal(actionBlocks[0]?.elements[0]?.text.text, "후보자 7명 검토하기");
});

test("candidate copy supports readable presentation variants", () => {
  const sentences = [
    "첫 문장입니다.",
    "두 번째 문장입니다.",
    "세 번째 문장입니다.",
    "확인이 필요한 사항도 함께 안내합니다.",
  ];
  assert.equal(
    renderAutoIntroCandidateCopy("paragraph", sentences),
    sentences.join(" ")
  );
  assert.match(
    renderAutoIntroCandidateCopy("tldr", sentences),
    /^\*TL;DR\* — 첫 문장입니다\.\n\n/
  );
  assert.match(
    renderAutoIntroCandidateCopy("bullets", sentences),
    /^• 첫 문장입니다\.\n• 두 번째 문장입니다\./
  );
  const mixed = renderAutoIntroCandidateCopy("tldr_bullets", sentences);
  assert.ok(mixed.includes("*TL;DR* — 첫 문장입니다."));
  assert.ok(mixed.includes("• 두 번째 문장입니다."));
  assert.ok(mixed.endsWith("확인이 필요한 사항도 함께 안내합니다."));
});

test("rich candidate profile follows the recruiter-style Slack layout", () => {
  const copy = renderAutoIntroSlackProfile({
    currentRole: "AI Solutions Engineer @ Lendflow",
    education: "University of Texas at Austin",
    harperNote:
      "Software, ML infrastructure, and hardware integration experience reinforce one another.",
    location: "Austin, TX (open to relocation)",
    preferences: [
      "Industry: Defense technology",
      "Scope: Software that directly affects hardware systems",
    ],
    tldr: "Defense-focused software engineer with hands-on interceptor-drone backend experience.",
    workSummary: [
      {
        bullets: [
          "Built embedded credit infrastructure for fintechs and lenders",
        ],
        heading: "AI Solutions Engineer @ Lendflow (current)",
      },
    ],
  });
  assert.match(copy, /^\*Role:\* AI Solutions Engineer @ Lendflow/m);
  assert.match(copy, /^\*Location:\* Austin, TX \(open to relocation\)$/m);
  assert.match(copy, /^\*Education:\* University of Texas at Austin$/m);
  assert.match(copy, /^_\*PLEASE REPLY TO REQUEST AN INTRO\*_$/m);
  assert.doesNotMatch(copy, /^>/m);
  assert.match(copy, /\*TL;DR\* - Defense-focused software engineer/);
  assert.match(copy, /\*Harper Note\* - Software, ML infrastructure/);
  assert.match(copy, /^Work Summary:$/m);
  assert.match(copy, /^\*AI Solutions Engineer @ Lendflow \(current\)\*$/m);
  assert.doesNotMatch(copy, /\*Work Summary:\*/);
  assert.match(copy, /• Built embedded credit infrastructure/);
  assert.match(copy, /\*Preferences:\*/);
});

test("candidate copy rejects per-candidate questions and connection CTAs", () => {
  assert.deepEqual(
    validateAutoIntroCandidateSentences([
      "첫 문장입니다.",
      "두 번째 문장입니다.",
      "세 번째 문장입니다.",
      "확인 사항입니다.",
    ]),
    [
      "첫 문장입니다.",
      "두 번째 문장입니다.",
      "세 번째 문장입니다.",
      "확인 사항입니다.",
    ]
  );
  assert.throws(
    () =>
      validateAutoIntroCandidateSentences([
        "첫 문장입니다.",
        "두 번째 문장입니다.",
        "세 번째 문장입니다.",
        "연결해드릴까요?",
      ]),
    /must not contain an individual CTA or question/
  );
});

test("all roles and more than five candidates stay in one workspace group", () => {
  const items = Array.from({ length: 7 }, (_, index) => ({
    roleId: index < 3 ? "role-a" : "role-b",
    talentId: `talent-${index + 1}`,
    workspaceId: "workspace-1",
  }));
  const groups = groupAutoIntroItemsByWorkspaceAndRole(items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.items.length, 7);
  assert.deepEqual(
    groups[0]?.roles.map((role) => [role.roleId, role.items.length]),
    [
      ["role-a", 3],
      ["role-b", 4],
    ]
  );
});

test("author detailed reason is required and remains separate from Slack copy", () => {
  const sentences = ["문장 1.", "문장 2.", "문장 3.", "문장 4."];
  assert.throws(
    () =>
      validateAutoIntroInternalReason({
        internalReason: null,
        reasonMode: "author",
        sentences,
      }),
    /no detailed reason/
  );
  assert.throws(
    () =>
      validateAutoIntroInternalReason({
        internalReason: sentences.join(" "),
        reasonMode: "author",
        sentences,
      }),
    /must differ/
  );
  const detailedReason =
    "**TL;DR** - 상세 추천 이유입니다.\n\n근거와 맥락을 길게 설명합니다.";
  assert.equal(
    validateAutoIntroInternalReason({
      internalReason: detailedReason,
      reasonMode: "author",
      sentences,
    }),
    detailedReason
  );
  assert.throws(
    () =>
      validateAutoIntroInternalReason({
        internalReason: detailedReason,
        reasonMode: "codex",
        sentences,
      }),
    /must not replace stored reason/
  );
});
