import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSlackTalentReviewAccessDeniedView,
  buildSlackTalentReviewAcceptDecisionView,
  buildSlackTalentReviewCandidateView,
  buildSlackTalentReviewDecisionProcessingView,
  buildSlackTalentReviewDecisionResultView,
  buildSlackTalentReviewRejectDecisionView,
  decodeSlackTalentReviewViewMetadata,
  HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID,
  HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID,
  HARPER_TALENT_REVIEW_CONNECTION_MODE_ACTION_ID,
  HARPER_TALENT_REVIEW_REJECT_ACTION_ID,
  HARPER_TALENT_REVIEW_REJECT_CALLBACK_ID,
  markdownToSlackMrkdwn,
  parseSlackTalentReviewDecisionSubmission,
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
    canManageCandidates: true,
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
    canManageCandidates: true,
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

test("candidate review modal contains profile sections and live decisions", () => {
  const view = buildSlackTalentReviewCandidateView({
    canManageCandidates: true,
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
      [HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID, "accept"],
      [HARPER_TALENT_REVIEW_REJECT_ACTION_ID, "reject"],
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
    canManageCandidates: true,
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

test("accept confirmation mirrors org connection choices and explains the live action", () => {
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
  assert.equal(view.submit.text, "소개 이메일 보내기");
  assert.match(rendered, /"dispatch_action":true/);
  assert.match(rendered, /소개 이메일/);
  assert.match(rendered, /직접 연락/);
  assert.match(rendered, /연결 메모/);
  assert.doesNotMatch(rendered, /Email intro|Direct contact|Recipients|Connection note/);
  assert.match(rendered, /보낸 이메일은 회수할 수 없어요/);
  assert.doesNotMatch(rendered, /미리보기/);
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

test("reject confirmation preserves reason presets and explains the irreversible result", () => {
  const view = buildSlackTalentReviewRejectDecisionView({
    candidate: CANDIDATE,
    candidateIndex: 0,
    sourceMessageId: 42,
  }) as { blocks: Array<Record<string, any>>; submit: { text: string } };
  const rendered = JSON.stringify(view.blocks);
  assert.equal(view.submit.text, "연결 거절하기");
  assert.match(rendered, /경력이 부족함/);
  assert.match(rendered, /위치 조건이 맞지 않음/);
  assert.match(rendered, /연결 거절 이유/);
  assert.match(rendered, /종료 결정이 후보자에게 표시/);
  assert.match(rendered, /안내는 회수할 수 없어요/);
  assert.doesNotMatch(rendered, /미리보기/);

  const result = JSON.stringify(
    buildSlackTalentReviewDecisionResultView({
      candidateName: "김하퍼",
      decision: "reject",
    })
  );
  assert.match(result, /김하퍼님과 연결을 거절했어요/);
  assert.doesNotMatch(result, /Connect|Reject/);
  assert.match(result, /후보자에게 .*배려 있게 안내/);
  assert.match(result, /연결 과정에서 더 이상 진행되지 않으며/);
  assert.match(result, /다음 추천 기준에 참고/);
});

test("viewer candidate review stays read-only", () => {
  const view = buildSlackTalentReviewCandidateView({
    canManageCandidates: false,
    candidate: CANDIDATE,
    candidateCount: 1,
    candidateIndex: 0,
    sourceMessageId: 42,
  }) as { blocks: Array<Record<string, any>> };
  const rendered = JSON.stringify(view.blocks);

  assert.doesNotMatch(
    rendered,
    new RegExp(HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID)
  );
  assert.doesNotMatch(
    rendered,
    new RegExp(HARPER_TALENT_REVIEW_REJECT_ACTION_ID)
  );
  assert.match(rendered, /Owner 또는 Admin/);
});

test("accept submission parses connection method, recipients, and reason", () => {
  const parsed = parseSlackTalentReviewDecisionSubmission({
    callbackId: HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID,
    state: {
      values: {
        review_accept_connection_mode: {
          [HARPER_TALENT_REVIEW_CONNECTION_MODE_ACTION_ID]: {
            selected_option: { value: "cc_intro" },
          },
        },
        review_accept_intro_members: {
          intro_members: {
            selected_options: [
              { value: "Owner@Example.com" },
              { value: "owner@example.com" },
              { value: "admin@example.com" },
            ],
          },
        },
        review_accept_reason: {
          accept_reason: { value: "  시스템 운영 경험이 잘 맞습니다.  " },
        },
      },
    },
  });

  assert.deepEqual(parsed, {
    submission: {
      acceptReason: "시스템 운영 경험이 잘 맞습니다.",
      connectionMode: "cc_intro",
      decision: "accept",
      introEmails: ["owner@example.com", "admin@example.com"],
    },
  });
});

test("CC introduction requires at least one current member selection", () => {
  const parsed = parseSlackTalentReviewDecisionSubmission({
    callbackId: HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID,
    state: {
      values: {
        review_accept_connection_mode: {
          [HARPER_TALENT_REVIEW_CONNECTION_MODE_ACTION_ID]: {
            selected_option: { value: "cc_intro" },
          },
        },
      },
    },
  });

  assert.deepEqual(parsed, {
    errors: {
      review_accept_intro_members:
        "소개 메일에 포함할 회사 멤버를 1명 이상 선택해 주세요.",
    },
  });
});

test("reject submission combines selected and written reasons", () => {
  const parsed = parseSlackTalentReviewDecisionSubmission({
    callbackId: HARPER_TALENT_REVIEW_REJECT_CALLBACK_ID,
    state: {
      values: {
        review_reject_note: {
          reject_note: { value: "도메인 경험을 조금 더 보고 싶습니다." },
        },
        review_reject_reasons: {
          reject_reasons: {
            selected_options: [
              { value: "경력이 부족함" },
              { value: "위치 조건이 맞지 않음" },
            ],
          },
        },
      },
    },
  });

  assert.deepEqual(parsed, {
    submission: {
      decision: "reject",
      stopNote:
        "경력이 부족함\n위치 조건이 맞지 않음\n도메인 경험을 조금 더 보고 싶습니다.",
    },
  });
});

test("decision result views distinguish email and direct contact outcomes", () => {
  const processing = JSON.stringify(
    buildSlackTalentReviewDecisionProcessingView("accept")
  );
  const emailed = JSON.stringify(
    buildSlackTalentReviewDecisionResultView({
      candidateName: "김하퍼",
      connectionMode: "cc_intro",
      decision: "accept",
    })
  );
  const direct = JSON.stringify(
    buildSlackTalentReviewDecisionResultView({
      candidateName: "김하퍼",
      connectionMode: "contact_directly",
      decision: "accept",
    })
  );

  assert.match(processing, /처리하고 있어요/);
  assert.match(emailed, /소개 이메일을 보냈어요/);
  assert.match(emailed, /같은 이메일에서 인사하고 다음 일정을 직접 조율/);
  assert.match(emailed, /서로에게 좋은 기회가 되길 바랄게요/);
  assert.match(direct, /직접 연락해 인사하고 다음 일정을 조율해 주세요/);
  assert.match(direct, /서로에게 좋은 기회가 되길 바랄게요/);
});
