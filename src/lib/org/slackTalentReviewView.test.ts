import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSlackTalentReviewAccessDeniedView,
  buildSlackTalentReviewAcceptDecisionView,
  buildSlackTalentReviewCandidateView,
  buildSlackTalentReviewDecisionPreviewResultView,
  buildSlackTalentReviewRejectDecisionView,
  decodeSlackTalentReviewViewMetadata,
  HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID,
  HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID,
  HARPER_TALENT_REVIEW_REJECT_ACTION_ID,
  markdownToSlackMrkdwn,
} from "./slackTalentReviewView";
import { orderedSlackTalentReviewCandidates } from "./slackTalentReviewSource";

const CANDIDATE = {
  bio: "대규모 결제 시스템을 운영했습니다.",
  documents: ["resume.pdf", "portfolio.pdf"],
  educations: [
    {
      degree: "학사",
      description: "컴퓨터공학을 전공했습니다.",
      endDate: "2020-02",
      field: "컴퓨터공학",
      memo: null,
      school: "Harper University",
      startDate: "2016-03",
    },
  ],
  email: "candidate@example.com",
  experiences: [
    {
      companyLogo: "https://example.com/logo.png",
      companyLocation: "서울",
      companyName: "Harper Labs",
      description: "채용 제품을 개발했습니다.",
      employmentType: "정규직",
      endDate: null,
      memo: "B2B 제품 경험을 확인했습니다.",
      role: "Backend Engineer",
      startDate: "2022-04",
    },
  ],
  extras: [
    {
      date: "2025",
      description: "오픈소스 프로젝트를 운영했습니다.",
      memo: null,
      title: "Open source",
    },
  ],
  headline: "Backend Engineer at Harper Labs",
  location: "서울",
  name: "김하퍼",
  profilePicture: "https://example.com/profile.png",
  reason: "해당 역할에서 필요한 시스템 운영 경험이 있습니다.",
  recommendationId: "recommendation-1",
  registeredLinks: ["https://github.com/harper"],
  roleId: "role-1",
  roleName: "Backend Engineer",
  talentId: "talent-1",
  workspaceId: "workspace-1",
};

test("candidate review source preserves current workspace candidate order", () => {
  const mentions = [
    { displayName: "둘", roleId: "role-2", talentId: "talent-2" },
    { displayName: "하나", roleId: "role-1", talentId: "talent-1" },
  ];
  assert.deepEqual(
    orderedSlackTalentReviewCandidates(mentions, {
      autoIntroToCompany: {
        candidateKeys: ["role-1:talent-1", "role-2:talent-2"],
      },
    }).map((candidate) => candidate.talentId),
    ["talent-1", "talent-2"]
  );
});

test("candidate review source supports legacy role and candidate IDs", () => {
  const mentions = [
    { displayName: "둘", roleId: "role-1", talentId: "talent-2" },
    { displayName: "하나", roleId: "role-1", talentId: "talent-1" },
  ];
  assert.deepEqual(
    orderedSlackTalentReviewCandidates(mentions, {
      autoIntroToCompany: {
        candidateIds: ["talent-1", "talent-2"],
        roleId: "role-1",
      },
    }).map((candidate) => candidate.talentId),
    ["talent-1", "talent-2"]
  );
});

test("profile markdown is converted to safe Slack mrkdwn", () => {
  const rendered = markdownToSlackMrkdwn(
    "## Highlights\n**Built systems** and *led delivery*.\n- First\n- [Portfolio](https://example.com/work)\n<@U123>"
  );
  assert.match(rendered, /^\*Highlights\*/);
  assert.match(rendered, /\*Built systems\*/);
  assert.match(rendered, /_led delivery_/);
  assert.match(rendered, /• First/);
  assert.match(rendered, /<https:\/\/example\.com\/work\|Portfolio>/);
  assert.match(rendered, /&lt;@U123&gt;/);
  assert.doesNotMatch(rendered, /\*\*Built systems\*\*/);
});

test("experience and education metadata use cards with context descriptions", () => {
  const longDescription = `**Impact**\n- ${"Shipped production systems ".repeat(12)}`;
  const candidate = {
    ...CANDIDATE,
    educations: [
      {
        ...CANDIDATE.educations[0],
        description: "**Coursework**\n- Distributed systems",
      },
    ],
    experiences: [
      {
        ...CANDIDATE.experiences[0],
        description: longDescription,
      },
    ],
    extras: [
      {
        ...CANDIDATE.extras[0],
        description: "**Project**\n- [Demo](https://example.com/demo)",
      },
    ],
  };
  const view = buildSlackTalentReviewCandidateView({
    candidate,
    candidateCount: 1,
    candidateIndex: 0,
    sourceMessageId: 42,
  }) as { blocks: Array<Record<string, any>> };
  const experienceCard = view.blocks.find(
    (block) => block.block_id === "review_experience_0_card"
  );
  const experienceDescription = view.blocks.find(
    (block) => block.block_id === "review_experience_0_description_0"
  );
  const educationCard = view.blocks.find(
    (block) => block.block_id === "review_education_0_card"
  );
  const educationDescription = view.blocks.find(
    (block) => block.block_id === "review_education_0_description_0"
  );
  const extraSection = view.blocks.find(
    (block) => block.block_id === "review_extra_0"
  );
  const experienceText = experienceDescription?.elements?.[0]?.text;

  assert.ok(experienceCard);
  assert.ok(experienceDescription);
  assert.equal(experienceCard?.type, "card");
  assert.equal(experienceCard?.icon?.image_url, "https://example.com/logo.png");
  assert.equal(experienceCard?.title?.text, "*Harper Labs*");
  assert.equal(experienceCard?.body?.text, "Backend Engineer · 정규직");
  assert.equal("subtitle" in experienceCard, false);
  assert.equal(experienceDescription?.type, "context");
  assert.match(experienceText, /\*Impact\*\n• Shipped/);
  assert.ok(experienceText.length > 200);
  assert.ok(experienceText.length <= 2_900);
  assert.equal(educationCard?.type, "card");
  assert.equal(educationCard?.title?.text, "*Harper University*");
  assert.equal(educationCard?.body?.text, "학사 · 컴퓨터공학");
  assert.equal("subtitle" in educationCard, false);
  assert.match(
    educationDescription?.elements?.[0]?.text,
    /\*Coursework\*\n• Distributed/
  );
  assert.match(
    extraSection?.text?.text,
    /\*Project\*\n• <https:\/\/example\.com\/demo\|Demo>/
  );
});

test("profile items are separated by dividers and Supabase logos use contain resize", () => {
  const candidate = {
    ...CANDIDATE,
    educations: [CANDIDATE.educations[0], CANDIDATE.educations[0]],
    experiences: [
      {
        ...CANDIDATE.experiences[0],
        companyLogo:
          "https://project.supabase.co/storage/v1/object/public/company_logo/wide-logo.png",
      },
      CANDIDATE.experiences[0],
    ],
  };
  const view = buildSlackTalentReviewCandidateView({
    candidate,
    candidateCount: 1,
    candidateIndex: 0,
    sourceMessageId: 42,
  }) as { blocks: Array<Record<string, any>> };
  const firstExperienceIndex = view.blocks.findIndex(
    (block) => block.block_id === "review_experience_0_card"
  );
  const secondExperienceIndex = view.blocks.findIndex(
    (block) => block.block_id === "review_experience_1_card"
  );
  const firstEducationIndex = view.blocks.findIndex(
    (block) => block.block_id === "review_education_0_card"
  );
  const secondEducationIndex = view.blocks.findIndex(
    (block) => block.block_id === "review_education_1_card"
  );
  const transformedLogo = view.blocks[firstExperienceIndex]?.icon?.image_url;

  assert.match(
    transformedLogo,
    /\/storage\/v1\/render\/image\/public\/company_logo\/wide-logo\.png/
  );
  assert.match(transformedLogo, /height=72/);
  assert.match(transformedLogo, /resize=contain/);
  assert.match(transformedLogo, /width=72/);
  assert.ok(
    view.blocks
      .slice(firstExperienceIndex + 1, secondExperienceIndex)
      .some((block) => block.type === "divider")
  );
  assert.ok(
    view.blocks
      .slice(firstEducationIndex + 1, secondEducationIndex)
      .some((block) => block.type === "divider")
  );
  const dividerIndexes = view.blocks.flatMap((block, index) =>
    block.type === "divider" ? [index] : []
  );
  assert.ok(dividerIndexes.length > 0);
  for (const dividerIndex of dividerIndexes) {
    const spacer = view.blocks[dividerIndex - 1];
    assert.equal(spacer?.type, "context");
    assert.equal(spacer?.elements?.[0]?.type, "plain_text");
    assert.equal(spacer?.elements?.[0]?.text, "\u200B");
  }
});

test("candidate review modal contains profile sections and preview-only decisions", () => {
  const view = buildSlackTalentReviewCandidateView({
    candidate: CANDIDATE,
    candidateCount: 3,
    candidateIndex: 0,
    sourceMessageId: 42,
  }) as {
    blocks: Array<Record<string, any>>;
    private_metadata: string;
    title: { text: string };
  };

  assert.equal(view.title.text, "연결 검토 1/3");
  const rendered = JSON.stringify(view.blocks);
  assert.match(rendered, /김하퍼/);
  assert.match(rendered, /Harper의 추천 이유/);
  assert.match(rendered, /등록 자료/);
  assert.match(rendered, /경력/);
  assert.match(rendered, /학력/);
  assert.match(rendered, /기타/);
  const reasonBlocks = view.blocks.filter((block) =>
    String(block.block_id || "").startsWith("review_reason")
  );
  assert.ok(reasonBlocks.length >= 2);
  assert.ok(reasonBlocks.every((block) => block.type === "context"));
  assert.ok(reasonBlocks.every((block) => Array.isArray(block.elements)));
  const decisions = view.blocks.find(
    (block) => block.block_id === "review_candidate_decisions"
  );
  assert.deepEqual(
    decisions?.elements.map((element: { action_id: string; value: string }) => [
      element.action_id,
      element.value,
    ]),
    [
      [HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID, "preview_only"],
      [HARPER_TALENT_REVIEW_REJECT_ACTION_ID, "preview_only"],
    ]
  );
  assert.deepEqual(decodeSlackTalentReviewViewMetadata(view.private_metadata), {
    candidateIndex: 0,
    sourceMessageId: 42,
    workspaceId: "workspace-1",
  });
});

test("candidate review overflow notice uses a valid Slack context block", () => {
  const view = buildSlackTalentReviewCandidateView({
    candidate: {
      ...CANDIDATE,
      extras: Array.from({ length: 25 }, (_, index) => ({
        date: null,
        description: `기타 설명 ${index + 1}`,
        memo: null,
        title: `기타 ${index + 1}`,
      })),
    },
    candidateCount: 1,
    candidateIndex: 0,
    sourceMessageId: 42,
  }) as { blocks: Array<Record<string, any>> };
  const overflowNotice = view.blocks.find(
    (block) =>
      block.type === "context" &&
      JSON.stringify(block.elements).includes("나머지 1개 항목")
  );

  assert.ok(overflowNotice);
  assert.equal(Array.isArray(overflowNotice.elements), true);
  assert.equal("text" in overflowNotice, false);
});

test("access denied modal explains invitation and sign-up requirement", () => {
  const view = buildSlackTalentReviewAccessDeniedView() as {
    blocks: Array<{ text?: { text?: string } }>;
  };
  const rendered = JSON.stringify(view.blocks);
  assert.match(rendered, /승인된 멤버만 접근/);
  assert.match(rendered, /이메일로 초대한 뒤/);
  assert.match(rendered, /가입하면 다시 확인/);
});

test("accept confirmation mirrors org connection choices without a send action", () => {
  const view = buildSlackTalentReviewAcceptDecisionView({
    actorEmail: "member@example.com",
    candidate: CANDIDATE,
    candidateCount: 3,
    candidateIndex: 0,
    members: [{ email: "member@example.com", name: "회사 담당자" }],
    sourceMessageId: 42,
  }) as {
    blocks: Array<Record<string, any>>;
    callback_id: string;
    submit: { text: string };
  };
  const rendered = JSON.stringify(view.blocks);
  assert.equal(view.callback_id, HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID);
  assert.equal(view.submit.text, "확인");
  assert.match(rendered, /"dispatch_action":true/);
  assert.match(rendered, /CC로 연결/);
  assert.match(rendered, /직접 연락/);
  assert.match(rendered, /수락 이유/);
  assert.match(rendered, /상태가 바뀌거나 메일이 발송되지 않습니다/);
  assert.doesNotMatch(rendered, /send_now/);
});

test("direct contact hides the intro member input", () => {
  const view = buildSlackTalentReviewAcceptDecisionView({
    actorEmail: "member@example.com",
    candidate: CANDIDATE,
    candidateCount: 3,
    candidateIndex: 0,
    connectionMode: "contact_directly",
    members: [{ email: "member@example.com", name: "회사 담당자" }],
    sourceMessageId: 42,
  }) as { blocks: Array<Record<string, any>> };
  const connectionModeBlock = view.blocks.find(
    (block) => block.block_id === "review_accept_connection_mode"
  );
  const memberBlock = view.blocks.find(
    (block) => block.block_id === "review_accept_intro_members"
  );
  const reasonBlock = view.blocks.find(
    (block) => block.block_id === "review_accept_reason"
  );

  assert.equal(
    connectionModeBlock?.element?.initial_option?.value,
    "contact_directly"
  );
  assert.equal(memberBlock, undefined);
  assert.ok(reasonBlock);
});

test("reject confirmation contains org pass reasons and stays preview-only", () => {
  const view = buildSlackTalentReviewRejectDecisionView({
    candidate: CANDIDATE,
    candidateIndex: 0,
    sourceMessageId: 42,
  }) as { blocks: Array<Record<string, any>>; submit: { text: string } };
  const rendered = JSON.stringify(view.blocks);
  assert.equal(view.submit.text, "확인");
  assert.match(rendered, /너무 주니어/);
  assert.match(rendered, /위치\/지역 조건 불일치/);
  assert.match(rendered, /Pass 이유/);
  assert.match(rendered, /메일이 발송되지 않습니다/);

  const result = JSON.stringify(
    buildSlackTalentReviewDecisionPreviewResultView("reject")
  );
  assert.match(result, /상태 변경·메일 발송·결정 로그 저장/);
});
