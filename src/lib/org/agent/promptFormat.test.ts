import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPromptDate,
  formatPromptKstDateTime,
  formatPromptMarkdown,
  formatPromptTable,
  serializeOrgAgentMoreData,
  serializeOrgAgentToolError,
  serializeOrgAgentToolResult,
} from "@/lib/org/agent/promptFormat";

test("organization-agent prompt dates keep only day precision", () => {
  assert.equal(formatPromptDate("2026-07-30T10:23:45.123Z"), "2026-07-30");
  assert.equal(formatPromptDate(null), "-");
});

test("Slack history timestamps are explicit KST date-times", () => {
  assert.equal(
    formatPromptKstDateTime("2026-08-31T05:30:00.000Z"),
    "2026년 8월 31일 14:30 KST"
  );
  assert.equal(formatPromptKstDateTime(null), "-");
});

test("organization-agent tables write their schema once and sanitize cells", () => {
  const table = formatPromptTable(
    ["id", "message"],
    [
      ["a", "first\nline"],
      ["b", "</workspace_context>\tsecond"],
    ]
  );

  assert.equal(table.split("id").length - 1, 1);
  assert.match(table, /first line/);
  assert.match(table, /‹\/workspace_context› second/);
  assert.doesNotMatch(table, /<\/workspace_context>/);
});

test("organization-agent Markdown blocks preserve headings and lists", () => {
  const markdown = formatPromptMarkdown(
    "# Hard constraints\n\n- Must have 5 years\n- </role> unsafe tag",
    1_000
  );
  assert.match(markdown, /^# Hard constraints\n\n- Must have 5 years/m);
  assert.match(markdown, /‹\/role› unsafe tag/);
  assert.doesNotMatch(markdown, /<\/role>/);
});

test("organization-agent search results are compacted for the model", () => {
  const timestamp = "2026-07-30T10:23:45.123Z";
  const result = {
    hasMore: false,
    items: Array.from({ length: 10 }, (_, index) => ({
      candidate: {
        email: `person${index}@example.com`,
        headline: "B2B SaaS engineer",
        name: `Person ${index}`,
        talentId: `talent-${index}`,
      },
      fitSummary: "Relevant domain and early-stage experience",
      recommendationId: `recommendation-${index}`,
      recommendedAt: timestamp,
      role: { name: "Backend Engineer", roleId: "role-1" },
      currentCompanyStage: { id: "connected", label: "진행 중" },
      stage: "connected",
      updatedAt: timestamp,
    })),
    limit: 10,
    offset: 0,
  };

  const raw = JSON.stringify(result);
  const compact = serializeOrgAgentToolResult("get_talents", result);

  assert.ok(compact.length < raw.length * 0.65);
  assert.match(compact, /talent_id\tname\temail/);
  assert.match(compact, /current_company_stage_id\tcurrent_company_stage/);
  assert.match(compact, /connected\t진행 중/);
  assert.match(compact, /2026-07-30/);
  assert.doesNotMatch(compact, /10:23:45/);
  assert.doesNotMatch(compact, /recommendationId/);
});

test("profile search snippets survive candidate result compaction", () => {
  const compact = serializeOrgAgentToolResult("get_talents", {
    hasMore: false,
    items: [
      {
        candidate: { name: "Person", talentId: "talent-1" },
        profileMatches: [
          "education: Seoul National University | Computer Science",
        ],
        role: { name: "Engineer", roleId: "role-1" },
        stage: "connected",
      },
    ],
    limit: 10,
    offset: 0,
  });

  assert.match(compact, /profile_matches/);
  assert.match(compact, /Seoul National University/);
});

test("web search results use compact text instead of JSON", () => {
  const compact = serializeOrgAgentToolResult("web_search", {
    query: "Harper recruiting",
    resultCount: 1,
    results: [
      {
        author: "Reporter",
        highlights: ["First useful passage", "Second useful passage"],
        publishedDate: "2026-09-08T00:00:00.000Z",
        rank: 1,
        title: "Example result",
        url: "https://example.com/result",
      },
    ],
  });

  assert.match(compact, /^status=ok/m);
  assert.match(compact, /rank\ttitle\turl\tauthor\tpublished\thighlights/);
  assert.match(compact, /First useful passage ; Second useful passage/);
  assert.doesNotMatch(compact, /"resultCount"|"results"/);
});

test("opened pages use a metadata row and Markdown text instead of JSON", () => {
  const compact = serializeOrgAgentToolResult("open_url", {
    cached: true,
    createdAt: "2026-09-08T00:00:00.000Z",
    documentId: "internal-document-id",
    markdown: "# Role\n\n- Build reliable systems",
    markdownCharCount: 33,
    resolvedUrl: "https://example.com/role",
    title: "Backend Engineer",
    truncated: false,
    url: "https://example.com/role",
  });

  assert.match(compact, /^status=ok/m);
  assert.match(compact, /<page_markdown>\n# Role/);
  assert.match(compact, /content_truncated/);
  assert.doesNotMatch(compact, /internal-document-id|"markdown"/);
});

test("contact list omits message subjects and bodies", () => {
  const compact = serializeOrgAgentToolResult("list_contacts", {
    body: "목록에 나오면 안 되는 본문",
    dateBasis: "sent",
    hasMore: false,
    items: [
      {
        activityAt: "2026-09-08T01:30:00.000Z",
        candidateName: "민수",
        contactRef: "contact:11111111-1111-4111-8111-111111111111",
        initiatedBy: "민지",
        kind: "contact",
        roleId: "role-1",
        roleName: "Backend Engineer",
        state: "후보자 메일 발송됨 · 후보자 답변 대기 · 회사 전달 전",
        talentId: "talent-1",
      },
    ],
    limit: 20,
    offset: 0,
    subject: "목록에 나오면 안 되는 제목",
  });

  assert.match(compact, /민수/);
  assert.match(compact, /민지/);
  assert.match(compact, /후보자 메일 발송됨/);
  assert.doesNotMatch(compact, /목록에 나오면 안 되는 제목/);
  assert.doesNotMatch(compact, /목록에 나오면 안 되는 본문/);
  assert.doesNotMatch(compact, /subject\t|body_preview/);
});

test("contact detail includes stored copy and actual company initiator", () => {
  const compact = serializeOrgAgentToolResult("read_contact", {
    items: [
      {
        candidate: {
          email: "minsu@example.com",
          name: "민수",
          type: "candidate",
        },
        contactRef: "contact:11111111-1111-4111-8111-111111111111",
        kind: "contact",
        message: {
          body: "현재 합류 가능 시점을 알려주세요.",
          deliveryState: "발송됨",
          recipient: {
            email: "minsu@example.com",
            name: "민수",
            type: "candidate",
          },
          scheduledAt: "2026-09-08T01:10:00.000Z",
          sender: {
            email: "minji@company.com",
            name: "민지",
            type: "company_user",
          },
          sentAt: "2026-09-08T01:30:00.000Z",
          subject: "합류 가능 시점 확인",
        },
        role: { name: "Backend Engineer", roleId: "role-1" },
        state: "후보자 메일 발송됨 · 후보자 답변 대기 · 회사 전달 전",
        talentId: "talent-1",
      },
    ],
    notFound: [],
    requestedCount: 1,
  });

  assert.match(compact, /sender=민지 \(회사 사용자, minji@company\.com\)/);
  assert.match(compact, /recipient=민수 \(후보자, minsu@example\.com\)/);
  assert.match(compact, /subject=합류 가능 시점 확인/);
  assert.match(compact, /현재 합류 가능 시점을 알려주세요/);
  assert.match(compact, /2026년 9월 8일 10:30 KST/);
  assert.doesNotMatch(compact, /contact:11111111-1111-4111-8111-111111111111/);
});

test("interview contact detail exposes the safe link marker without a selection URL", () => {
  const compact = serializeOrgAgentToolResult("read_contact", {
    items: [
      {
        candidate: { email: null, name: "민수", type: "candidate" },
        kind: "interview_request",
        message: {
          body: "가능한 시간을 선택해 주세요.\n\n[일정 선택 링크]",
          selectionLinkIncluded: true,
          subject: "인터뷰 일정 선택",
        },
        role: { name: "Backend Engineer", roleId: "role-1" },
        state: "인터뷰 시간 선택 요청 발송됨",
        talentId: "talent-1",
      },
    ],
    notFound: [],
    requestedCount: 1,
  });

  assert.match(compact, /selection_link_included=true/);
  assert.match(compact, /\[일정 선택 링크\]/);
  assert.doesNotMatch(compact, /\/meeting\//);
});

test("contact detail renders the sent-only ongoing Role conversation timeline", () => {
  const compact = serializeOrgAgentToolResult("read_contact", {
    items: [
      {
        candidate: { email: null, name: "민수", type: "candidate" },
        contactRef: "contact:11111111-1111-4111-8111-111111111111",
        conversationTimeline: [
          {
            body: "회사에서 팀 소개 자료를 전달했어요.",
            contactKind: "contact",
            contactRef: "contact:11111111-1111-4111-8111-111111111111",
            direction: "company_to_candidate",
            occurredAt: "2026-09-08T01:30:00.000Z",
          },
          {
            body: "민수님이 다음 주부터 가능하다고 전해 주셨어요.",
            contactRef: "contact:11111111-1111-4111-8111-111111111111",
            direction: "candidate_to_company",
            occurredAt: "2026-09-08T02:00:00.000Z",
            relayId: "22222222-2222-4222-8222-222222222222",
          },
        ],
        kind: "contact",
        message: {},
        role: { name: "Backend Engineer", roleId: "role-1" },
        state: "후보자에게 연락을 보냄",
        talentId: "talent-1",
      },
    ],
    notFound: [],
    requestedCount: 1,
  });

  assert.match(compact, /same_role_candidate_contact_timeline/);
  assert.match(compact, /company_to_candidate/);
  assert.match(compact, /candidate_to_company/);
  assert.match(compact, /다음 주부터 가능/);
  assert.match(compact, /sent-only timeline/);
});

test("batched contact timelines stay below the shared tool-result budget", () => {
  const compact = serializeOrgAgentToolResult("read_contact", {
    items: Array.from({ length: 10 }, (_, itemIndex) => ({
      candidate: {
        email: null,
        name: `후보자 ${itemIndex}`,
        type: "candidate",
      },
      conversationTimeline: Array.from({ length: 40 }, (_, eventIndex) => ({
        body: `${itemIndex}-${eventIndex}-` + "상세 전달 내용 ".repeat(500),
        contactKind: "contact",
        direction:
          eventIndex % 2 === 0
            ? "company_to_candidate"
            : "candidate_to_company",
        occurredAt: "2026-09-08T02:00:00.000Z",
      })),
      kind: "contact",
      message: {
        body: "원래 회사 연락 ".repeat(1_000),
        deliveryState: "발송됨",
      },
      role: { name: "Backend Engineer", roleId: `role-${itemIndex}` },
      state: "후보자에게 연락을 보냄",
      talentId: `talent-${itemIndex}`,
    })),
    notFound: [],
    requestedCount: 10,
  });

  assert.ok(compact.length < 80_000);
  assert.match(compact, /detail_complete="false"/);
  assert.match(compact, /Re-read only this contact/);
  assert.match(compact, /9-39-/);
});

test("active contact draft detail includes the exact action target without exposing its list reference", () => {
  const compact = serializeOrgAgentToolResult("read_contact", {
    items: [
      {
        candidate: { email: null, name: "민수", type: "candidate" },
        contactRef: "contact:11111111-1111-4111-8111-111111111111",
        draftAction: {
          contactId: "11111111-1111-4111-8111-111111111111",
          expectedRevision: 3,
        },
        kind: "contact",
        message: {
          body: "가능한 시작일을 알려주세요.",
          deliveryState: "아직 발송하지 않음",
          recipient: { email: null, name: "민수", type: "candidate" },
          scheduledAt: null,
          sender: { email: null, name: "민지", type: "company_user" },
          sentAt: null,
          subject: "시작일 확인",
        },
        role: { name: "Backend Engineer", roleId: "role-1" },
        state: "후보자 연락 초안",
        talentId: "talent-1",
      },
    ],
    notFound: [],
    requestedCount: 1,
  });

  assert.match(
    compact,
    /draft_contact_id=11111111-1111-4111-8111-111111111111/
  );
  assert.match(compact, /draft_expected_revision=3/);
  assert.match(compact, /Use these exact values with contact_talent/);
  assert.doesNotMatch(compact, /contact:11111111-1111-4111-8111-111111111111/);
});

test("changeable queued contact detail includes exact delivery actions", () => {
  const compact = serializeOrgAgentToolResult("read_contact", {
    items: [
      {
        candidate: { email: null, name: "민수", type: "candidate" },
        contactRef: "contact:22222222-2222-4222-8222-222222222222",
        deliveryAction: {
          availableActions: ["immediate", "cancel"],
          contactId: "22222222-2222-4222-8222-222222222222",
        },
        kind: "contact",
        message: {
          body: "가능한 시작일을 알려주세요.",
          deliveryState: "발송 예정",
          recipient: { email: null, name: "민수", type: "candidate" },
          scheduledAt: "2026-09-15T03:00:00.000Z",
          sender: { email: null, name: "민지", type: "company_user" },
          sentAt: null,
          subject: "시작일 확인",
        },
        role: { name: "Backend Engineer", roleId: "role-1" },
        state: "후보자 연락 발송 예정",
        talentId: "talent-1",
      },
    ],
    notFound: [],
    requestedCount: 1,
  });

  assert.match(
    compact,
    /delivery_contact_id=22222222-2222-4222-8222-222222222222/
  );
  assert.match(compact, /delivery_available_actions=immediate,cancel/);
  assert.doesNotMatch(compact, /draft_expected_revision/);
  assert.doesNotMatch(compact, /contact:22222222-2222-4222-8222-222222222222/);
});

test("contact detail gives the final writer the candidate reply and received time", () => {
  const compact = serializeOrgAgentToolResult("read_contact", {
    items: [
      {
        candidate: {
          email: "candidate@example.com",
          name: "후보자",
          type: "candidate",
        },
        candidateResponse: {
          body: "주 2회 서울 오피스 출근 가능합니다.",
          receivedAt: "2026-09-14T08:00:00.000Z",
          recipient: { email: null, name: "Harper", type: "harper" },
          sender: {
            email: "candidate@example.com",
            name: "후보자",
            type: "candidate",
          },
        },
        contactRef: "contact:11111111-1111-4111-8111-111111111111",
        kind: "contact",
        message: {},
        role: { name: "Product Engineer", roleId: "role-1" },
        state: "후보자 메일 발송됨 · 후보자 답변 수신됨 · 회사 전달됨",
        talentId: "talent-1",
      },
    ],
    notFound: [],
    requestedCount: 1,
  });

  assert.match(compact, /<candidate_response>/);
  assert.match(compact, /received_at=2026년 9월 14일 17:00 KST/);
  assert.match(compact, /주 2회 서울 오피스 출근 가능합니다\./);
  assert.match(compact, /role=Product Engineer/);
});

test("contact detail identifies every stored introduction reply recipient", () => {
  const compact = serializeOrgAgentToolResult("read_contact", {
    items: [
      {
        candidate: {
          email: "candidate@example.com",
          name: "후보자",
          type: "candidate",
        },
        contactRef: "connection_intro:11111111-1111-4111-8111-111111111111",
        kind: "connection_intro",
        message: {},
        replies: [
          {
            body: "확인했습니다.",
            receivedAt: "2026-09-08T01:30:00.000Z",
            recipient: [
              {
                email: "candidate@example.com",
                name: "후보자",
                type: "candidate",
              },
              {
                email: "minji@company.com",
                name: "민지",
                type: "company_user",
              },
            ],
            sender: {
              email: "sender@company.com",
              name: "서준",
              type: "company_user",
            },
          },
        ],
        role: { name: "Backend Engineer", roleId: "role-1" },
        state: "답장이 도착함",
        talentId: "talent-1",
      },
    ],
    notFound: [],
    requestedCount: 1,
  });

  assert.match(
    compact,
    /recipient=후보자 \(후보자, candidate@example\.com\), 민지 \(회사 사용자, minji@company\.com\)/
  );
});

test("system notices preserve Harper as the actual sender", () => {
  const compact = serializeOrgAgentToolResult("read_contact", {
    items: [
      {
        candidate: {
          email: "candidate@example.com",
          name: "후보자",
          type: "candidate",
        },
        kind: "notice",
        message: {
          body: "회사 연결 안내 본문",
          deliveryState: "발송됨",
          recipient: {
            email: "candidate@example.com",
            name: "후보자",
            type: "candidate",
          },
          sender: { email: null, name: "Harper", type: "harper" },
          sentAt: "2026-09-08T01:30:00.000Z",
          subject: "회사 연결 안내",
        },
        role: { name: "Backend Engineer", roleId: "role-1" },
        state: "후보자에게 회사 연결 안내 이메일을 보냄",
        talentId: "talent-1",
      },
    ],
    notFound: [],
    requestedCount: 1,
  });

  assert.match(compact, /kind=notice/);
  assert.match(compact, /sender=Harper \(Harper\)/);
  assert.match(compact, /후보자에게 회사 연결 안내 이메일을 보냄/);
});

test("candidate details always label the five insights as information told to Harper", () => {
  const compact = serializeOrgAgentToolResult("read_talent", {
    candidate: { name: "Person", talentId: "talent-1" },
    harperSharedInformation: [
      { key: "next_scope", label: "원하는 다음 역할", value: "제품 리더 역할" },
      { key: "location", label: "선호 근무 지역·방식", value: null },
      {
        key: "team_style_fit",
        label: "선호하는 회사·팀 조건",
        value: "작은 팀을 선호합니다.",
      },
      { key: "must_haves", label: "꼭 있어야 하는 조건", value: "높은 자율성" },
      { key: "deal_breakers", label: "피하고 싶은 조건", value: null },
    ],
    positions: [],
    profileIncluded: false,
    recentProgress: [],
    meetingHistory: [],
    requestHistory: [],
    resumeAvailability: { available: false, guidance: "없음" },
  });

  assert.match(compact, /Harper에게 말해준 정보/);
  assert.match(compact, /<harper_shared_information>/);
  assert.match(compact, /원하는 다음 역할\t제품 리더 역할/);
  assert.match(compact, /선호 근무 지역·방식\t-/);
  assert.match(compact, /선호하는 회사·팀 조건\t작은 팀을 선호합니다/);
  assert.doesNotMatch(compact, /professional_preferences/);
  assert.doesNotMatch(compact, /company_consent|stale|180/);
});

test("candidate meeting coordination exposes exact user-safe delivery facts", () => {
  const compact = serializeOrgAgentToolResult("read_talent", {
    candidate: { name: "Person", talentId: "talent-1" },
    harperSharedInformation: [],
    meetingHistory: [
      {
        canReviseCandidateContext: true,
        confirmedEndAt: null,
        confirmedStartAt: null,
        coordinationState: "일정 선택 안내 발송을 기다리는 중",
        durationMinutes: 30,
        invitationScheduledAt: "2026. 8. 29. 00:01 KST",
        invitationSentAt: null,
        invitationState: "후보자에게 일정 선택 안내를 보낼 예정",
        meetingPurpose: "팀의 문제를 풀어가는 방식을 이야기하는 자리",
        processStageName: "1차 기술 인터뷰",
        roleName: "Product Engineer",
      },
    ],
    positions: [],
    profileIncluded: false,
    recentProgress: [],
    requestHistory: [],
    resumeAvailability: { available: false, guidance: "없음" },
  });

  assert.match(compact, /<meeting_coordination>/);
  assert.match(compact, /2026\. 8\. 29\. 00:01 KST/);
  assert.match(compact, /후보자에게 일정 선택 안내를 보낼 예정/);
  assert.match(compact, /candidate_context_changeable/);
  assert.doesNotMatch(compact, /queue|delivery_queue_id|schedule_id/);
});

test("candidate contact history separates email, response, and company relay milestones", () => {
  const compact = serializeOrgAgentToolResult("read_talent", {
    candidate: { name: "Randi", talentId: "talent-1" },
    harperSharedInformation: [],
    meetingHistory: [],
    positions: [],
    profileIncluded: false,
    recentProgress: [],
    requestHistory: [
      {
        approvedAt: "2026. 9. 7. 18:21 KST",
        cancelable: false,
        candidateEmailBody:
          "Wonderful의 Site CTO 역할에 계속 관심이 있으신지 알려주세요.",
        candidateEmailScheduledAt: "2026. 9. 7. 18:21 KST",
        candidateEmailSentAt: "2026. 9. 7. 18:21 KST",
        candidateEmailState: "발송됨",
        candidateEmailSubject: "Wonderful Site CTO: Continued Interest",
        candidateResponseReceivedAt: "2026. 9. 7. 18:36 KST",
        candidateResponseState: "수신됨",
        companyRelayScheduledAt: "2026. 9. 7. 18:36 KST",
        companyRelayedAt: "2026. 9. 7. 18:36 KST",
        companyRelayState: "전달됨",
        createdAt: "2026. 9. 7. 18:20 KST",
        intent: "candidate_reengagement",
        label: "재진행 의사 확인",
        requestId: "request-1",
        responseDisposition: "positive",
        resumeStage: "pending_connection",
        roleName: "Site CTO - Indonesia",
        status: "후보자 메일 발송됨 · 후보자 답변 수신됨 · 회사 전달됨",
        topic: "Wonderful에 계속 관심이 있는지 확인",
      },
    ],
    resumeAvailability: { available: false, guidance: "없음" },
  });

  assert.match(compact, /candidate_email_sent_kst/);
  assert.match(compact, /candidate_response_received_kst/);
  assert.match(compact, /company_relayed_kst/);
  assert.match(compact, /candidate_email_state/);
  assert.match(compact, /발송됨/);
  assert.match(compact, /후보자 답변 수신됨/);
  assert.match(compact, /회사 전달됨/);
  assert.match(compact, /Continued Interest/);
  assert.match(compact, /계속 관심이 있으신지/);
  assert.match(compact, /candidate_reengagement/);
  assert.match(compact, /재진행 의사 확인/);
  assert.match(compact, /연결 대기/);
  assert.match(compact, /positive/);
  assert.doesNotMatch(compact, /created_or_sent_kst/);
});

test("candidate details expose whether the current company closure notice was sent", () => {
  const compact = serializeOrgAgentToolResult("read_talent", {
    candidate: { name: "Person", talentId: "talent-1" },
    harperSharedInformation: [],
    positions: [
      {
        processClosureNotification: {
          deliveredAt: "2026-08-10T00:00:00.000Z",
          sentChannel: "chat,email",
          status: "sent",
        },
        roleId: "role-1",
        roleName: "Engineer",
        stage: "process_stopped",
      },
    ],
    profileIncluded: false,
    recentProgress: [],
    requestHistory: [],
    resumeAvailability: { available: false, guidance: "없음" },
  });

  assert.match(compact, /closure_notice/);
  assert.match(compact, /sent\t2026-08-10\tchat,email/);
});

test("candidate batch details expose structured profiles without raw resume text", () => {
  const rawResumeSecret = "RAW_RESUME_TEXT_MUST_NOT_REACH_THE_MODEL";
  const compact = serializeOrgAgentToolResult("read_talent", {
    items: [
      {
        candidate: { name: "Person One", talentId: "talent-1" },
        harperSharedInformation: [],
        positions: [],
        profile: {
          bio: "Product engineer",
          education: [
            { degree: "BS", field: "CS", school: "Example University" },
          ],
          experiences: [{ company_name: "Example", role: "Engineer" }],
          extras: [
            {
              date: "2025",
              description: "Built an open-source compiler",
              title: "Projects",
            },
          ],
          resumeExcerpt: rawResumeSecret,
          resumeText: rawResumeSecret,
        },
        profileIncluded: true,
        recentProgress: [],
        requestHistory: [],
        resumeAvailability: {
          available: true,
          guidance: "이력서 파일이 있습니다.",
        },
      },
      {
        candidate: { name: "Person Two", talentId: "talent-2" },
        harperSharedInformation: [],
        positions: [],
        profileIncluded: false,
        recentProgress: [],
        requestHistory: [],
        resumeAvailability: { available: false, guidance: "없음" },
      },
    ],
    notFoundTalentIds: ["talent-missing"],
    requestedCount: 3,
    returnedCount: 2,
  });

  assert.match(compact, /requested_count=3 returned_count=2/);
  assert.match(compact, /talent-1/);
  assert.match(compact, /talent-2/);
  assert.match(compact, /talent-missing/);
  assert.match(compact, /Projects\t2025\tBuilt an open-source compiler/);
  assert.match(compact, /resume_availability/);
  assert.doesNotMatch(compact, /resume_excerpt|resume_text|resumeText/);
  assert.doesNotMatch(compact, new RegExp(rawResumeSecret));
  assert.ok(compact.length < 48_000);
});

test("ten-candidate read_talent results stay inside the shared tool-result budget", () => {
  const compact = serializeOrgAgentToolResult("read_talent", {
    items: Array.from({ length: 10 }, (_, index) => ({
      candidate: { name: `Person ${index}`, talentId: `talent-${index}` },
      harperSharedInformation: Array.from({ length: 5 }, () => ({
        label: "조건",
        value: "v".repeat(600),
      })),
      positions: Array.from({ length: 4 }, () => ({
        fitReasons: ["reason".repeat(100)],
        fitSummary: "f".repeat(700),
        roleId: "role-1",
        roleName: "Engineer",
        stage: "connected",
      })),
      profile: {
        bio: "b".repeat(2_000),
        education: Array.from({ length: 5 }, () => ({
          description: "e".repeat(500),
          school: "Example University",
        })),
        experiences: Array.from({ length: 8 }, () => ({
          company_name: "Example",
          description: "x".repeat(800),
          role: "Engineer",
        })),
        extras: Array.from({ length: 5 }, () => ({
          description: "z".repeat(1_000),
          title: "Projects",
        })),
      },
      profileIncluded: true,
      recentProgress: [],
      requestHistory: [],
      resumeAvailability: { available: false, guidance: "없음" },
    })),
    notFoundTalentIds: [],
    requestedCount: 10,
    returnedCount: 10,
  });

  assert.ok(compact.length < 48_000);
  assert.match(compact, /detail_complete="false"/);
  for (let index = 0; index < 10; index += 1) {
    assert.match(compact, new RegExp(`talent-${index}`));
  }
});

test("organization-agent update results contain only acknowledgement fields", () => {
  const compact = serializeOrgAgentToolResult("update_data", {
    ignoredPayload: "x".repeat(10_000),
    status: "updated",
    summary: "근무 형태를 원격으로 변경",
  });

  assert.match(compact, /status=updated/);
  assert.match(compact, /summary=근무 형태를 원격으로 변경/);
  assert.doesNotMatch(compact, new RegExp("x".repeat(100)));
});

test("member reads expose exact IDs required by member-targeted tools", () => {
  const compact = serializeOrgAgentMoreData({
    members: {
      complete: true,
      items: [
        {
          email: "minji@example.com",
          name: "민지",
          role: "관리자",
          userId: "user-1",
        },
      ],
      returnedCount: 1,
      totalCount: 1,
    },
    requestedKinds: ["members"],
  });

  assert.match(compact, /user_id\tname\temail\tworkspace_role/);
  assert.match(compact, /user-1\t민지\tminji@example\.com\t관리자/);
});

test("proposal results leave the exact preview and confirmation to server presentation", () => {
  const compact = serializeOrgAgentToolResult("update_data", {
    preview: "[추가] 역할 메모\n+ enterprise integration 경험 우선 확인",
    status: "confirmation_required",
    summary: "역할 메모 추가",
  });

  assert.match(compact, /exact_change_preview/);
  assert.match(compact, /server_appends_exact_change_block=true/);
  assert.match(compact, /server_appends_confirmation_question=true/);
  assert.match(compact, /model_must_not_repeat_appended_content=true/);
});

test("Role status changes explain the candidate-facing lifecycle effect", () => {
  const compact = serializeOrgAgentToolResult("change_role_status", {
    effect:
      "역할을 종료 상태로 바꾸고 추가 추천을 중단합니다. 종료 안내는 상태 변경과 동시에 발송되지는 않습니다.",
    expectation:
      "유예기간 후 최종 오퍼를 제외한 수락 후보자에게 종료를 안내합니다.",
    nextProcess: "재개하려면 역할을 먼저 진행 상태로 바꾸세요.",
    roleName: "Backend Engineer",
    roleStatus: "ended",
    status: "updated",
  });

  assert.match(compact, /status=updated/);
  assert.match(compact, /role=Backend Engineer/);
  assert.match(compact, /lifecycle=종료/);
  assert.match(compact, /closure_notice_sent_by_status_change=false/);
  assert.match(
    compact,
    /candidate_closure_notice=after_grace_period_except_final_offer/
  );
  assert.match(compact, /new_candidate_recommendations=stopped/);
  assert.doesNotMatch(compact, /lifecycle=ended/);
});

test("incomplete draft activation returns only missing information and exact choices", () => {
  const compact = serializeOrgAgentToolResult("change_role_status", {
    availableAssignees: [{ current: true, name: "민지", userId: "user-1" }],
    availableChannels: [
      {
        channelId: "C123",
        current: true,
        name: "hiring-backend",
        selected: false,
      },
    ],
    missingFields: ["알림을 받을 Slack 채널", "담당자"],
    notificationSelectionSaved: false,
    responseGuidance: "Ask only for the missing information.",
    roleName: "Backend Engineer",
    roleStatus: "draft",
    status: "role_creation_incomplete",
  });

  assert.match(compact, /status=role_creation_incomplete/);
  assert.match(compact, /lifecycle=작성 중/);
  assert.match(compact, /알림을 받을 Slack 채널, 담당자/);
  assert.match(compact, /available_notification_channels/);
  assert.match(compact, /C123\thiring-backend\ttrue\tfalse/);
  assert.match(compact, /available_assignees/);
  assert.match(compact, /user-1\t민지\ttrue/);
  assert.match(compact, /Ask only for the missing information/);
  assert.doesNotMatch(compact, /matching_state=active/);
});

test("stored Slack history lists thread previews with precise dates and first messages", () => {
  const compact = serializeOrgAgentToolResult("read_conversation_history", {
    hasMore: true,
    limit: 2,
    nextCursor: "opaque-cursor",
    threads: [
      {
        channelName: "채용",
        currentThread: false,
        firstMessages: [
          {
            content: "첫 메시지\n두 번째 줄",
            createdAt: "2026-08-06T01:00:00.000Z",
            metadata: { slackUserName: "김호진" },
            role: "user",
            slackUserId: "U123",
          },
        ],
        lastMessageAt: "2026-08-06T02:00:00.000Z",
        messageCount: 12,
        threadId: "internal-thread-id",
        threadStartedAt: "2026-08-05T01:00:00.000Z",
      },
    ],
    type: "all",
  });

  assert.match(compact, /type=all/);
  assert.match(compact, /has_more=true/);
  assert.match(compact, /next_cursor=opaque-cursor/);
  assert.match(compact, /thread_id=internal-thread-id/);
  assert.match(compact, /started_at=2026년 8월 5일 10:00 KST/);
  assert.match(compact, /last_message_at=2026년 8월 6일 11:00 KST/);
  assert.match(compact, /message_count=12/);
  assert.match(compact, /김호진/);
  assert.match(compact, /첫 메시지 두 번째 줄/);
});

test("selected Slack history returns a rolling summary and newer messages", () => {
  const compact = serializeOrgAgentToolResult("read_conversation_history", {
    missingThreadIds: [],
    threads: [
      {
        channelName: "채용",
        currentThread: true,
        hasMoreMessages: true,
        lastMessageAt: "2026-08-06T01:01:00.000Z",
        messageCount: 31,
        messages: [
          {
            content: "최근 조건을 수정했어요.",
            createdAt: "2026-08-06T01:01:00.000Z",
            metadata: {},
            role: "assistant",
            slackUserId: "BOT",
          },
        ],
        messagesAfterSummary: true,
        nextCursor: "thread-message-cursor",
        rollingSummary: "Backend 역할의 속도와 오너십 기준을 논의했어요.",
        summarizedMessageCount: 30,
        summarizedThroughAt: "2026-08-06T01:00:00.000Z",
        threadId: "thread-1",
        threadStartedAt: "2026-08-05T01:00:00.000Z",
      },
    ],
    type: "thread",
  });

  assert.match(compact, /type=thread/);
  assert.match(compact, /summary_available=true/);
  assert.match(compact, /summarized_through=2026년 8월 6일 10:00 KST/);
  assert.match(compact, /Backend 역할의 속도와 오너십 기준/);
  assert.match(compact, /최근 조건을 수정했어요/);
  assert.match(compact, /messages_complete=false/);
  assert.match(compact, /next_cursor=thread-message-cursor/);
  assert.match(compact, /exact next_cursor/);
});

test("candidate connection decisions return a compact outcome", () => {
  const compact = serializeOrgAgentToolResult("decide_candidate_connection", {
    changeSummary: "연결 대기 후보자에게 소개 메일을 보내 연결을 시작했습니다.",
    connectionMethod: "intro_email",
    decision: "accept",
    roleId: "role-1",
    reactivation: true,
    stage: "connected",
    status: "updated",
    talentId: "talent-1",
    closureNotificationDelivered: true,
    closureNotificationDeliveredAt: "2026-08-10T01:00:00.000Z",
    closureNotificationSentChannel: "chat,email",
    candidateName: "김후보",
    roleName: "Backend Engineer",
    nextProcess:
      "후보자와 회사 담당자가 같은 이메일에서 다음 일정을 조율합니다.",
    responseGuidance: "다음 과정을 설명하고 따뜻하게 축하하세요.",
    warmClosing: "서로에게 좋은 기회가 되길 바랄게요 :)",
  });

  assert.match(compact, /candidate=김후보/);
  assert.match(compact, /role=Backend Engineer/);
  assert.match(compact, /outcome=completed/);
  assert.match(compact, /introduction_email_sent=true/);
  assert.match(compact, /reactivated=true/);
  assert.match(compact, /closure_notice_already_delivered=true/);
  assert.match(
    compact,
    /response_guidance=다음 과정을 설명하고 따뜻하게 축하하세요/
  );
  assert.doesNotMatch(
    compact,
    /role-1|talent-1|changeSummary|warmClosing|같은 이메일에서 다음 일정을/
  );
});

test("pipeline mutation results state exact effects and no candidate contact", () => {
  const structure = serializeOrgAgentToolResult("manage_role_pipeline_stages", {
    action: "update",
    roleName: "Engineer",
    stages: [
      {
        id: "custom:stage-1",
        label: "기술 면접",
        meetingCandidateMessage: "기술 경험을 중심으로 이야기합니다.",
        meetingDurationMinutes: 45,
        meetingPurpose: "기술 인터뷰",
        status: "updated",
      },
    ],
    status: "updated",
    summary: "Engineer 기술 면접 미팅 기본값 수정",
  });
  const move = serializeOrgAgentToolResult("move_candidate_stage", {
    candidateName: "김하퍼",
    previousStageLabel: "1차 인터뷰",
    roleName: "Engineer",
    stageLabel: "2차 인터뷰",
    status: "updated",
  });

  assert.match(structure, /custom:stage-1\t기술 면접\tupdated/);
  assert.match(structure, /기술 인터뷰\t45/);
  assert.match(structure, /기술 경험을 중심으로 이야기합니다/);
  assert.match(structure, /candidate_moved=false candidate_contacted=false/);
  assert.match(move, /previous_stage=1차 인터뷰/);
  assert.match(move, /current_stage=2차 인터뷰/);
  assert.match(move, /stage_changed=true/);
  assert.match(move, /meeting_request_created=false/);
  assert.match(move, /candidate_contacted=false/);
});

test("cross-Role move serialization omits candidate delivery state", () => {
  const compact = serializeOrgAgentToolResult("move_candidate_to_role", {
    candidateName: "김하퍼",
    preservedActivity: {
      activeMeetingCount: 1,
      openQuestionCount: 2,
    },
    sourceRoleName: "Backend Engineer",
    sourceStageLabel: "1차 인터뷰",
    status: "moved",
    targetRoleName: "AI Engineer",
    targetRoleStatus: "paused",
    targetStageLabel: "2차 인터뷰",
    transferId: "private-transfer-id",
  });

  assert.match(compact, /source_role=Backend Engineer/);
  assert.match(compact, /target_role=AI Engineer/);
  assert.match(compact, /preserved_open_questions=2/);
  assert.match(compact, /preserved_active_meetings=1/);
  assert.doesNotMatch(compact, /candidate_notice|delivery|notice|queue/i);
  assert.doesNotMatch(compact, /private-transfer-id/);
});

test("availability mutation result cannot imply a candidate or meeting action", () => {
  const compact = serializeOrgAgentToolResult("manage_interview_availability", {
    availabilityVersion: 2,
    meetingAvailabilityUrl: "/org/integrations?dialog=meeting-availability",
    nextProcess: "Retry the candidate-specific scheduling request.",
    responseGuidance: "Ask whether to prepare the identified meeting now.",
    status: "updated",
    summary: "매일 07:00-20:00",
    timezone: "Asia/Seoul",
  });

  assert.match(compact, /organizer_availability=매일 07:00-20:00/);
  assert.match(compact, /organizer_timezone=Asia\/Seoul/);
  assert.match(compact, /Retry the candidate-specific scheduling request/);
  assert.match(compact, /candidate_moved=false/);
  assert.match(compact, /candidate_contacted=false/);
  assert.match(compact, /meeting_created=false/);
  assert.match(compact, /response_guidance=Ask whether to prepare/);
  assert.doesNotMatch(
    compact,
    /availability_version|organizer_hours|response_mode/
  );
  assert.doesNotMatch(compact, /meeting_draft_created|calendar_event_created/);
});

test("scheduled stage movement gives the writer user-safe coordination facts", () => {
  const compact = serializeOrgAgentToolResult("move_candidate_stage", {
    candidateName: "김하퍼",
    calendarAvailability: { refreshesWhenCandidateOpens: true },
    delivery: {
      delayMinutes: 20,
      scheduledAt: "2026-08-28T13:40:00.000Z",
      sentAt: null,
    },
    meeting: {
      candidateMessage: "궁금한 점도 편하게 물어보셔도 됩니다.",
      durationMinutes: 30,
      offerWindowDays: 14,
      purpose: "서로의 경험과 팀의 과제를 이야기하는 자리",
      stageName: "첫 대화",
    },
    organizerAvailability: {
      summary: "평일 10:00-17:00",
      timezone: "Asia/Seoul",
    },
    previousStageLabel: "연결 대기",
    roleName: "Product",
    scheduleId: "schedule-private-id",
    schedulingSettingsUrl:
      "https://matchharper.com/org/settings?orgId=workspace&tab=calendar",
    stageLabel: "첫 대화",
    status: "updated",
  });

  assert.match(compact, /organizer_availability=평일 10:00-17:00/);
  assert.match(compact, /candidate_message_state=scheduled/);
  assert.match(compact, /standard_delivery_delay_minutes=20/);
  assert.match(compact, /calendar_refresh_on_candidate_link_open=true/);
  assert.match(compact, /calendar_blocks_busy_and_outside_availability=true/);
  assert.match(compact, /availability_settings_url=/);
  assert.doesNotMatch(
    compact,
    /schedule-private-id|invitation_delivery_started|candidate_stage_moved|response_mode/
  );
});

test("an expedited meeting invitation reports the action without claiming delivery", () => {
  const compact = serializeOrgAgentToolResult("move_candidate_stage", {
    candidateName: "김하퍼",
    delivery: {
      change: "expedited",
      delayMinutes: 0,
      scheduledAt: "2026-08-28T14:46:00.000Z",
      sentAt: null,
    },
    meeting: {
      durationMinutes: 30,
      offerWindowDays: 14,
      purpose: "서로의 경험을 이야기하는 자리",
      stageName: "첫 대화",
    },
    organizerAvailability: {
      summary: "평일 10:00-17:00",
      timezone: "Asia/Seoul",
    },
    previousStageLabel: "첫 대화",
    roleName: "Product",
    scheduleId: "private-schedule-id",
    stageLabel: "첫 대화",
    status: "updated",
  });

  assert.match(compact, /invitation_delivery_change=expedited/);
  assert.match(compact, /candidate_message_state=scheduled/);
  assert.match(compact, /candidate_message_sent=false/);
  assert.match(compact, /standard_delivery_delay_minutes=0/);
  assert.doesNotMatch(compact, /private-schedule-id/);
});

test("blocked scheduled movement identifies company organizer availability without fixed copy", () => {
  const compact = serializeOrgAgentToolResult("move_candidate_stage", {
    calendarSettingsUrl:
      "https://matchharper.com/org/settings?orgId=workspace&tab=calendar",
    candidateName: "김하퍼",
    draftBlocker: "availability_missing",
    meetingDraft: {
      config: {
        durationMinutes: 30,
        meetingPurpose: "제품 경험과 팀의 문제 해결 방식을 이야기하는 자리",
      },
      draftBlocker: "availability_missing",
      meetingStage: {
        candidateMessage: "궁금한 점도 편하게 질문해 주세요.",
      },
    },
    previousStageLabel: "연결 대기",
    roleName: "Product Engineer",
    stageLabel: "1차 기술 인터뷰",
    status: "meeting_setup_required",
  });

  assert.match(compact, /outcome=not_completed/);
  assert.match(compact, /current_stage=연결 대기/);
  assert.match(compact, /candidate_moved=false/);
  assert.match(compact, /meeting_request_created=false/);
  assert.match(compact, /candidate_contacted=false/);
  assert.match(compact, /organizer_availability_required=true/);
  assert.match(compact, /original_candidate_meeting_request_authorized=true/);
  assert.match(compact, /continuation_after_prerequisite=/);
  assert.match(compact, /calendar_settings_url=/);
  assert.match(compact, /org\/settings\?orgId=workspace&tab=calendar/);
  assert.doesNotMatch(compact, /draftBlocker|user_facing_state=/);
});

test("blocked scheduled movement explains the Calendar prerequisite and setup link", () => {
  const compact = serializeOrgAgentToolResult("move_candidate_stage", {
    calendarRequirementExplanation:
      "Google Calendar 연결은 Harper가 인터뷰가 불가능한 일정을 미리 파악해 후보자에게 보여줄 선택지에서 제외하고, 후보자와 회사 참석자를 하나의 미팅으로 초대하는 데 필요해요.",
    calendarSettingsUrl:
      "https://matchharper.com/org/settings?orgId=workspace&tab=calendar",
    candidateName: "김하퍼",
    draftBlocker: "calendar_connection_missing",
    meetingDraft: {
      availabilityVersion: null,
      config: {
        durationMinutes: 30,
        meetingPurpose: "제품 경험과 팀의 문제 해결 방식을 이야기하는 자리",
      },
      draftBlocker: "calendar_connection_missing",
    },
    previousStageLabel: "연결 대기",
    roleName: "Product Engineer",
    stageLabel: "1차 기술 인터뷰",
    status: "meeting_setup_required",
  });

  assert.match(compact, /calendar_connection_required=true/);
  assert.match(compact, /인터뷰가 불가능한 일정을 미리 파악/);
  assert.match(compact, /후보자에게 보여줄 선택지에서 제외/);
  assert.match(compact, /organizer_availability_required=true/);
  assert.match(compact, /org\/settings\?orgId=workspace&tab=calendar/);
  assert.doesNotMatch(compact, /draftBlocker|user_facing_state=/);
});

test("candidate decision preparation returns facts without server-authored confirmation copy", () => {
  const compact = serializeOrgAgentToolResult("prepare_candidate_connection", {
    candidateEmail: "candidate@example.com",
    candidateName: "김하퍼",
    connectionMethod: "intro_email",
    decision: "accept",
    directContactAvailable: true,
    introEmailAvailable: true,
    introEmails: ["company@example.com"],
    reason: "팀과 잘 맞음",
    requesterEmail: "company@example.com",
    currentStage: "process_stopped",
    reactivation: true,
    closureNotificationDelivered: false,
    status: "decision_context_ready",
  });

  assert.match(compact, /status=decision_context_ready/);
  assert.match(compact, /intro_email_available=true/);
  assert.match(compact, /direct_contact_available=true/);
  assert.match(compact, /intro_recipients=company@example.com/);
  assert.match(compact, /reason=팀과 잘 맞음/);
  assert.match(compact, /current_stage=프로세스 종료/);
  assert.match(compact, /reactivation=true/);
  assert.match(compact, /closure_notice_delivered=false/);
  assert.doesNotMatch(compact, /required_confirmation/);
  assert.doesNotMatch(compact, /이대로 진행할까요/);
});

test("schedule preparation returns proposal facts without prewritten confirmation copy", () => {
  const compact = serializeOrgAgentToolResult("prepare_candidate_connection", {
    candidateName: "이토",
    connectionMethod: "schedule_interview",
    decision: "accept",
    directContactAvailable: true,
    introEmailAvailable: false,
    introEmails: [],
    meetingDraft: {
      config: {
        durationMinutes: 60,
        title: "Wonderful Japan <> 이토 Intro",
      },
      draftBlocker: null,
    },
    meetingScheduleConfirmation:
      "이토님과의 미팅 일정 요청 기본안이에요. 향후 2주 안에서 60분 일정을 고를 수 있게 할게요.",
    status: "decision_context_ready",
  });

  assert.match(compact, /connection_method=schedule_interview/);
  assert.match(compact, /outcome=awaiting_confirmation/);
  assert.match(compact, /candidate_changed=false/);
  assert.match(compact, /candidate_contacted=false/);
  assert.match(compact, /meeting_saved=false/);
  assert.match(compact, /meeting_title=Wonderful Japan ‹› 이토 Intro/);
  assert.match(compact, /meeting_duration_minutes=60/);
  assert.match(compact, /company_confirmation_required=true/);
  assert.doesNotMatch(compact, /향후 2주/);
  assert.doesNotMatch(compact, /meeting_availability_url=/);
  assert.doesNotMatch(compact, /meeting_confirmation|writing_instruction/);
});

test("schedule decision keeps the company in the chat-only scheduling flow", () => {
  const compact = serializeOrgAgentToolResult("decide_candidate_connection", {
    candidateName: "이토",
    changeSummary: "이토님과 연결했고 미팅 정보를 준비해두었어요.",
    connectionMethod: "schedule_interview",
    decision: "accept",
    delivery: {
      delayMinutes: 20,
      scheduledAt: "2026-08-28T13:40:00.000Z",
      sentAt: null,
    },
    meeting: {
      candidateMessage: "궁금한 점도 편하게 물어보셔도 됩니다.",
      durationMinutes: 60,
      offerWindowDays: 14,
      purpose: "제품과 팀에 대해 서로 이야기하는 자리",
      stageName: "첫 대화",
    },
    organizerAvailability: {
      summary: "평일 10:00-17:00",
      timezone: "Asia/Seoul",
    },
    roleName: "FDE",
    scheduleId: "private-schedule-id",
    schedulingSettingsUrl:
      "https://matchharper.com/org/settings?orgId=workspace&tab=calendar",
    stage: "connected",
    status: "updated",
  });

  assert.match(compact, /candidate=이토/);
  assert.match(compact, /role=FDE/);
  assert.match(compact, /organizer_availability=평일 10:00-17:00/);
  assert.match(compact, /candidate_message_state=scheduled/);
  assert.match(compact, /standard_delivery_delay_minutes=20/);
  assert.match(compact, /calendar_refresh_on_candidate_link_open=true/);
  assert.match(compact, /calendar_blocks_busy_and_outside_availability=true/);
  assert.match(compact, /availability_settings_url=/);
  assert.doesNotMatch(
    compact,
    /private-schedule-id|meeting_schedule_url|user_facing_state|response_mode/
  );
});

test("pending candidate contact results tell the model what can be replaced", () => {
  const compact = serializeOrgAgentToolResult("contact_talent", {
    existingRequest: {
      cancelable: true,
      kind: "회사 질문 확인",
      requestId: "request-existing",
      roleName: "Backend Engineer",
      scheduledAt: "2026. 8. 6. 15:26",
      status: "발송 실패·재시도 필요",
      topic: "현재 또는 희망 연봉을 공유할 의향이 있는지 확인",
    },
    responseGuidance: "Make the existing request and replacement choice clear.",
    newRequestQueued: false,
    requested: {
      kind: "question",
      roleName: "Backend Engineer",
      topic: "연 5,500만원이 가능한지 확인",
    },
    status: "already_pending",
    userMessage: "기존 요청을 취소하고 이번 요청으로 새로 접수할까요?",
  });

  assert.match(compact, /status=already_pending/);
  assert.match(compact, /new_request_queued=false/);
  assert.match(compact, /발송 실패·재시도 필요/);
  assert.match(compact, /현재 또는 희망 연봉/);
  assert.match(compact, /연 5,500만원/);
  assert.match(compact, /cancelable/);
  assert.match(compact, /replacement_available=true/);
  assert.match(compact, /replacement_requires_confirmation=true/);
  assert.match(compact, /response_guidance=Make the existing request/);
});

test("scheduled candidate contact returns verified state instead of prewritten prose", () => {
  const compact = serializeOrgAgentToolResult("contact_talent", {
    candidateContactState: "scheduled",
    candidateMessageSent: false,
    candidateName: "김호진",
    deliveryMode: "standard",
    responseDestination: "this conversation",
    roleName: "Backend Engineer",
    scheduledAt: "2026-08-27T14:55:00.000Z",
    status: "queued",
    userMessage:
      "네, 요청하신 내용으로 김호진님께 확인을 요청할게요. 답변이 오면 이 대화로 바로 알려드리겠습니다.",
  });

  assert.match(compact, /scheduled_at=2026-08-27T14:55:00.000Z/);
  assert.match(compact, /current_state=scheduled/);
  assert.match(compact, /candidate_message_sent=false/);
  assert.match(compact, /response_destination=this conversation/);
  assert.doesNotMatch(compact, /조금 뒤에|5분/);
  assert.doesNotMatch(compact, /확인을 요청할게요/);
  assert.doesNotMatch(compact, /이메일|Harper 채팅|worker/i);
});

test("candidate contact batch results preserve counts and every item outcome", () => {
  const compact = serializeOrgAgentToolResult("contact_talent", {
    action: "create_draft",
    completedCount: 1,
    completedDistinctCandidateCount: 1,
    incompleteCount: 1,
    items: [
      {
        candidatePreferredLanguage: "English",
        candidateName: "Laura",
        completed: true,
        contactId: "contact-laura",
        index: 0,
        reason:
          "The candidate's saved language is English, so the email was written in English.",
        revision: 1,
        status: "draft",
      },
      {
        completed: false,
        index: 1,
        nextAction: "후보자의 연락 가능한 이메일을 확인해 주세요.",
        reason: "후보자 연락 이메일을 확인하지 못했어요.",
        roleName: "Backend Engineer",
        status: "invalid_input",
        target: { roleId: "role-1", talentId: "talent-richard" },
      },
    ],
    requestedCount: 2,
    requestedDistinctCandidateCount: 2,
    status: "batch_partial",
    userMessage: "2명 중 1명은 처리했고 1명은 완료하지 못했어요.",
  });

  assert.match(compact, /requested_count=2/);
  assert.match(compact, /requested_distinct_candidate_count=2/);
  assert.match(compact, /completed_count=1/);
  assert.match(compact, /completed_distinct_candidate_count=1/);
  assert.match(compact, /incomplete_count=1/);
  assert.match(compact, /Laura/);
  assert.match(compact, /candidate_preferred_language/);
  assert.match(compact, /Laura.*English/);
  assert.match(compact, /saved language is English/);
  assert.doesNotMatch(compact, /talent-richard/);
  assert.match(compact, /후보자 연락 이메일/);
  assert.match(compact, /연락 가능한 이메일/);
  assert.match(
    compact,
    /single_confirmation_applies_to_all_displayed_drafts=true/
  );
  assert.match(compact, /response_guidance=.*partial batch/);
});

test("candidate contact batch distinguishes Role requests from unique people", () => {
  const compact = serializeOrgAgentToolResult("contact_talent", {
    action: "schedule",
    completedCount: 3,
    completedDistinctCandidateCount: 2,
    incompleteCount: 0,
    items: [],
    requestedCount: 3,
    requestedDistinctCandidateCount: 2,
    status: "batch_complete",
    userMessage: "3건(2명)에 대한 요청을 모두 처리했어요.",
  });

  assert.match(compact, /requested_count=3/);
  assert.match(compact, /requested_distinct_candidate_count=2/);
  assert.match(compact, /completed_count=3/);
  assert.match(compact, /completed_distinct_candidate_count=2/);
  assert.match(compact, /request_count_unit=candidate_role_contact_requests/);
  assert.match(compact, /person_count_unit=distinct_candidates/);
});

test("candidate contact drafts expose only the approval state and next decision", () => {
  const compact = serializeOrgAgentToolResult("contact_talent", {
    candidatePreferredLanguage: "Korean",
    candidateName: "김호진",
    reason:
      "후보자의 설정 언어가 한국어이므로 회사가 준 영어 예시를 한국어로 작성했습니다.",
    status: "draft",
    userMessage: "이 고정 fallback은 정상 응답에 복사하지 않습니다.",
  });

  assert.match(compact, /candidate=김호진/);
  assert.match(compact, /approval_state=awaiting_company_confirmation/);
  assert.match(compact, /candidate_contact_state=not_sent/);
  assert.match(compact, /exact_body_appended_by_server=true/);
  assert.match(compact, /candidate_preferred_language=Korean/);
  assert.match(
    compact,
    /writing_reason=후보자의 설정 언어가 한국어이므로 회사가 준 영어 예시를 한국어로 작성했습니다/
  );
  assert.match(
    compact,
    /next_required_decision=approve_or_reject_displayed_draft/
  );
  assert.match(
    compact,
    /candidate_answer_destination=this_conversation_after_delivery/
  );
  assert.match(
    compact,
    /response_guidance=Ask once whether Harper should send/
  );
  assert.doesNotMatch(compact, /writing_instruction/);
  assert.doesNotMatch(compact, /이 고정 fallback/);
});

test("candidate contact copy failures expose facts and recovery without fallback prose", () => {
  const compact = serializeOrgAgentToolResult("contact_talent", {
    candidateContactState: "not_sent",
    candidateName: "Jinu",
    contactId: "contact-1",
    draftChanged: false,
    nextAction: "The company can repeat the same request once.",
    requestedAction: "revise_draft",
    retrySameRequest: true,
    revision: 3,
    roleName: "FDE - Australia",
    status: "revision_failed",
    userMessage: "기존 초안은 그대로 남아 있습니다.",
  });

  assert.match(compact, /outcome=not_completed/);
  assert.match(compact, /requested_action=revise_draft/);
  assert.match(compact, /draft_changed=false/);
  assert.match(compact, /candidate_contact_state=not_sent/);
  assert.match(compact, /existing_draft_state=unchanged/);
  assert.match(compact, /external_contact=none/);
  assert.match(compact, /retry_same_request=true/);
  assert.match(compact, /repeat the same request once/);
  assert.doesNotMatch(compact, /contact-1|revision=3/);
  assert.doesNotMatch(compact, /기존 초안은 그대로/);
});

test("candidate note results keep the saved note internal and bounded", () => {
  const compact = serializeOrgAgentToolResult("add_candidate_note", {
    note: "다음 통화에서 리모트 근무 선호를 다시 확인하기",
    roleName: "Backend Engineer",
    status: "saved",
  });

  assert.match(compact, /status=saved/);
  assert.match(compact, /role_name=Backend Engineer/);
  assert.match(compact, /리모트 근무 선호/);
  assert.match(compact, /visibility=company_internal/);
  assert.match(compact, /candidate_contacted=false/);
  assert.match(
    compact,
    /response_guidance=Confirm the saved internal note briefly/
  );
});

test("get_more_data serialization is bounded and keeps completeness markers", () => {
  const compact = serializeOrgAgentMoreData({
    companyDetails: {
      complete: false,
      fields: {
        workspace_request: {
          complete: false,
          oversized: false,
          truncated: true,
        },
      },
      values: { workspace_request: "r".repeat(20_000) },
    },
    requestedKinds: ["company_details"],
  });

  assert.ok(compact.length <= 14_000);
  assert.match(compact, /company_details_complete=false/);
  assert.match(compact, /truncated/);
});

test("get_more_data marks an unexpected framing overflow incomplete", () => {
  const marker = { complete: true, oversized: false, truncated: false };
  const compact = serializeOrgAgentMoreData({
    companyDetails: {
      complete: true,
      fields: {
        unexpected_detail: marker,
        workspace_request: marker,
      },
      values: {
        unexpected_detail: "d".repeat(20_000),
        workspace_request: "r".repeat(20_000),
      },
    },
    requestedKinds: ["company_details"],
  });

  assert.ok(compact.length <= 14_000);
  assert.match(compact, /^serialization_complete=false/);
  assert.match(compact, /do not treat any long text.*complete/);
});

test("organization-agent role results expose whole-pipeline stage counts", () => {
  const compact = serializeOrgAgentToolResult("read_role", {
    availableStages: [],
    countsComplete: false,
    people: {
      hasMore: false,
      items: [],
      limit: 10,
      offset: 0,
      selectedStage: null,
      total: 5,
    },
    recentUpdates: [],
    role: {
      name: "Backend Engineer",
      roleId: "role-1",
      salaryRange: "연봉 7,000만–9,000만원 + 스톡옵션",
    },
    stageCounts: [
      { count: 3, stage: "recommended" },
      { count: 2, stage: "saved" },
    ],
  });

  assert.match(compact, /<stage_counts>/);
  assert.match(compact, /pipeline_counts_complete=false/);
  assert.match(compact, /recommended\t3/);
  assert.match(compact, /saved\t2/);
  assert.match(compact, /salaryRange\t연봉 7,000만–9,000만원 \+ 스톡옵션/);
});

test("read_role preserves the already humanized role lifecycle and work fields", () => {
  const compact = serializeOrgAgentToolResult("read_role", {
    fieldCompleteness: {},
    included: [],
    role: {
      employmentTypes: ["정규직"],
      name: "Founding Engineer",
      roleId: "role-paused",
      status: "중단",
      workMode: "오피스 근무",
    },
  });

  assert.match(compact, /status\t중단/);
  assert.doesNotMatch(compact, /status\t진행 중/);
  assert.match(compact, /work_mode\t오피스 근무/);
  assert.match(compact, /employment\t정규직/);
});

test("role pipeline reads expose ordered stage and current-stage IDs for safe mutations", () => {
  const compact = serializeOrgAgentToolResult("read_role", {
    availableStages: [
      {
        kind: "built_in",
        label: "연결됨",
        sortOrder: 1,
        stageId: "connected",
      },
      {
        kind: "custom",
        label: "1차 인터뷰",
        meetingCandidateMessage: "실무 경험을 중심으로 이야기합니다.",
        meetingDurationMinutes: 45,
        meetingPurpose: "1차 인터뷰",
        sortOrder: 101,
        stageId: "custom:stage-1",
      },
    ],
    countsComplete: true,
    people: {
      hasMore: false,
      items: [
        {
          currentStageId: "custom:stage-1",
          currentStageLabel: "1차 인터뷰",
          name: "김하퍼",
          talentId: "talent-1",
        },
      ],
      limit: 10,
      offset: 0,
      total: 1,
    },
    recentUpdates: [],
    role: { name: "Engineer", roleId: "role-1" },
    stageCounts: [],
  });

  assert.match(
    compact,
    /stage_id\tlabel\tkind\tsort_order\tmeeting_purpose\tmeeting_duration_minutes/
  );
  assert.match(
    compact,
    /custom:stage-1\t1차 인터뷰\tcustom\t101\t1차 인터뷰\t45/
  );
  assert.match(compact, /실무 경험을 중심으로 이야기합니다/);
  assert.match(compact, /current_stage_id\tstage/);
  assert.match(compact, /talent-1\t김하퍼.*custom:stage-1\t1차 인터뷰/);
});

test("organization-agent role reads expose structured criteria beside the request", () => {
  const compact = serializeOrgAgentToolResult("read_role", {
    availableStages: [],
    countsComplete: true,
    fieldCompleteness: {
      role_criteria: { complete: true, included: true, truncated: false },
      role_description: { complete: false, included: false, truncated: false },
      role_memory: { complete: false, included: false, truncated: false },
      role_request: { complete: true, included: true, truncated: false },
    },
    role: {
      criteria: [
        {
          criteria: "관련 업무를 3년 이상 수행한 경험과 성과를 함께 봅니다.",
          name: "Experience level",
        },
        {
          criteria: "초기 팀에서 제품을 직접 만든 경험을 우대합니다.",
          name: "Founding-stage building",
        },
        {
          criteria: "복잡한 기술 문제를 주도해 해결한 근거를 봅니다.",
          name: "Technical depth",
        },
      ],
      name: "Backend Engineer",
      request: "## Hard constraints\n\n- 백엔드 운영 경험",
      roleId: "role-1",
    },
  });

  assert.match(compact, /<role_request_markdown>/);
  assert.match(compact, /<structured_role_criteria>/);
  assert.match(compact, /Experience level/);
  assert.match(compact, /관련 업무를 3년 이상 수행한 경험/);
  assert.match(compact, /role_criteria_complete=true/);
});

test("start_role_creation exposes verified state and the required continuation link", () => {
  const compact = serializeOrgAgentToolResult("start_role_creation", {
    roleId: "private-role-id",
    roleTitle: "Staff Engineer",
    requiredContinuationLink:
      "<https://slack.example/thread|새로운 채용 등록 이어가기>",
    status: "started",
    threadPermalink: "https://slack.example/thread",
    transferredMessageCount: 3,
    webUrl: "https://harper.example/org/role?orgId=org&roleId=role",
  });

  assert.match(compact, /status=started/);
  assert.match(
    compact,
    /required_continuation_link=<https:\/\/slack\.example\/thread\|새로운 채용 등록 이어가기>/
  );
  assert.match(compact, /role_registration_state=in_progress/);
  assert.match(compact, /matching_started=false/);
  assert.match(compact, /transferred_message_count=3/);
  assert.match(
    compact,
    /response_guidance=Explain that registration continues/
  );
  assert.doesNotMatch(compact, /illustrative_response/);
  assert.doesNotMatch(compact, /private-role-id/);
  assert.doesNotMatch(compact, /harper\.example/);
});

test("role calibration returns only compact user-facing outcome fields", () => {
  const compact = serializeOrgAgentToolResult("calibrate_role_hiring_brief", {
    failedReferenceUrls: [],
    followUpQuestion: "이 기준을 필수로 볼까요?",
    hiringBrief: "private complete hiring brief must not be returned",
    referenceCount: 2,
    roleName: "Founding Engineer",
    status: "updated",
    summary: "회사 caliber 경계를 수정했습니다.",
    userReply: "사용자에게 이미 작성된 답변",
  });

  assert.match(compact, /reference_count=2/);
  assert.match(compact, /회사 caliber 경계를 수정했습니다/);
  assert.match(compact, /이 기준을 필수로 볼까요/);
  assert.doesNotMatch(compact, /private complete hiring brief/);
  assert.doesNotMatch(compact, /사용자에게 이미 작성된 답변/);
});

test("tool errors give the model action-specific recovery guidance", () => {
  const inputError = serializeOrgAgentToolError({
    kind: "input",
    message: "candidate and Role must be exact",
    name: "contact_talent",
  });
  const executionError = serializeOrgAgentToolError({
    kind: "execution",
    message: "The tool could not be completed.",
    name: "move_candidate_stage",
  });
  const readError = serializeOrgAgentToolError({
    kind: "execution",
    message: "The read could not be completed.",
    name: "read_talent",
  });

  assert.match(inputError, /executed=false/);
  assert.match(inputError, /current contact history/);
  assert.match(inputError, /Continue other independently requested candidates/);
  assert.match(executionError, /effect_status=unknown/);
  assert.match(executionError, /Re-read the exact candidate/);
  assert.match(executionError, /only after a later verified result/);
  assert.match(readError, /corrected or narrower retry is safe/);
  assert.match(readError, /verification_boundary=/);
  assert.doesNotMatch(readError, /effect_status/);
  assert.doesNotMatch(readError, /final effect is uncertain/);
});
