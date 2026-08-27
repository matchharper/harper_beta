import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPromptDate,
  formatPromptMarkdown,
  formatPromptTable,
  serializeOrgAgentMoreData,
  serializeOrgAgentToolResult,
} from "@/lib/org/agent/promptFormat";

test("organization-agent prompt dates keep only day precision", () => {
  assert.equal(formatPromptDate("2026-07-30T10:23:45.123Z"), "2026-07-30");
  assert.equal(formatPromptDate(null), "-");
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

test("Role status changes explain the candidate-facing lifecycle effect", () => {
  const compact = serializeOrgAgentToolResult("change_role_status", {
    effect:
      "역할을 종료 상태로 바꾸고 추가 추천을 중단합니다. 후보자 화면은 역할 종료로 해석하지만, 기존 후보 단계와 회사 요청은 이 변경만으로 모두 자동 종료되지 않습니다.",
    expectation:
      "이미 검토 중인 후보자와 후보자에게 보낸 질문은 그대로 남습니다.",
    nextProcess: "남아 있는 후보자와 요청은 각각 마무리해 주세요.",
    roleName: "Backend Engineer",
    roleStatus: "ended",
    status: "updated",
  });

  assert.match(compact, /status=updated/);
  assert.match(compact, /role=Backend Engineer/);
  assert.match(compact, /lifecycle=종료/);
  assert.match(
    compact,
    /기존 후보 단계와 회사 요청은 .*자동 종료되지 않습니다/
  );
  assert.match(compact, /expectation=.*후보자에게 보낸 질문은 그대로 남습니다/);
  assert.match(compact, /next_process=남아 있는 후보자와 요청은 각각 마무리/);
  assert.doesNotMatch(compact, /lifecycle=ended/);
});

test("stored Slack history is serialized as a bounded thread-aware table", () => {
  const compact = serializeOrgAgentToolResult("read_conversation_history", {
    hasMore: true,
    limit: 2,
    messages: [
      {
        channelName: "채용",
        content: "첫 메시지\n두 번째 줄",
        createdAt: "2026-08-06T01:00:00.000Z",
        currentThread: false,
        metadata: { slackUserName: "김호진" },
        role: "user",
        slackThreadId: "internal-thread-id",
        slackUserId: "U123",
        threadStartedAt: "2026-08-05T01:00:00.000Z",
      },
      {
        channelName: "채용",
        content: "확인했습니다.",
        createdAt: "2026-08-06T01:01:00.000Z",
        currentThread: true,
        metadata: {},
        role: "assistant",
        slackThreadId: "current-internal-thread-id",
        slackUserId: "BOT",
        threadStartedAt: "2026-08-06T00:30:00.000Z",
      },
    ],
    nextCursor: "opaque-cursor",
    scope: "workspace",
  });

  assert.match(compact, /scope=workspace/);
  assert.match(compact, /has_more=true/);
  assert.match(compact, /next_cursor=opaque-cursor/);
  assert.match(compact, /channel\tthread\tthread_started_at\tsent_at\tspeaker/);
  assert.match(compact, /채용\tthread_1/);
  assert.match(compact, /current_thread/);
  assert.match(compact, /김호진/);
  assert.match(compact, /Harper/);
  assert.match(compact, /첫 메시지 두 번째 줄/);
  assert.doesNotMatch(compact, /internal-thread-id/);
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

  assert.match(compact, /decision=accept/);
  assert.match(compact, /connection_method=intro_email/);
  assert.match(compact, /stage=연결됨/);
  assert.match(compact, /reactivation=true/);
  assert.match(compact, /closure_notice_delivered=true/);
  assert.match(compact, /closure_notice_channel=chat,email/);
  assert.match(compact, /candidate=김후보/);
  assert.match(compact, /role=Backend Engineer/);
  assert.match(compact, /next_process=.*다음 일정을 조율합니다/);
  assert.match(compact, /warm_closing=서로에게 좋은 기회가 되길 바랄게요/);
  assert.doesNotMatch(compact, /stage=connected/);
  assert.doesNotMatch(compact, /talent-1/);
});

test("pipeline mutation results state exact effects and no candidate contact", () => {
  const structure = serializeOrgAgentToolResult("manage_role_pipeline_stages", {
    action: "add",
    roleName: "Engineer",
    stages: [
      { label: "기술 면접", status: "created" },
      { label: "컬처핏 인터뷰", status: "already_exists" },
    ],
    status: "updated",
    summary: "Engineer 파이프라인 단계 추가",
  });
  const move = serializeOrgAgentToolResult("move_candidate_stage", {
    candidateName: "김하퍼",
    previousStageLabel: "1차 인터뷰",
    roleName: "Engineer",
    stageLabel: "2차 인터뷰",
    status: "updated",
  });

  assert.match(structure, /기술 면접\tcreated/);
  assert.match(structure, /컬처핏 인터뷰\talready_exists/);
  assert.match(structure, /candidate_moved=false candidate_contacted=false/);
  assert.match(move, /from=1차 인터뷰/);
  assert.match(move, /to=2차 인터뷰/);
  assert.match(move, /candidate_contacted=false email_sent=false/);
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

  assert.match(compact, /organizer_hours=매일 07:00-20:00/);
  assert.match(compact, /timezone=Asia\/Seoul/);
  assert.match(compact, /response_guidance=.*identified meeting/);
  assert.match(
    compact,
    /user_facing_state=Harper will use these organizer hours/
  );
  assert.match(compact, /writing_instruction=Treat this as acknowledging/);
  assert.doesNotMatch(compact, /status=updated|availability_version|summary=/);
  assert.doesNotMatch(compact, /meeting_draft_created|calendar_event_created/);
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

test("schedule preparation keeps the automatic proposal in one compact confirmation", () => {
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
    meetingAvailabilityUrl:
      "https://matchharper.com/org/settings?dialog=interview-availability",
    status: "decision_context_ready",
  });

  assert.match(compact, /connection_method=schedule_interview/);
  assert.match(compact, /response_mode=meeting_coordinator_narrative/);
  assert.match(compact, /user_facing_state=This is a proposal awaiting/);
  assert.match(compact, /meeting_title=Wonderful Japan ‹› 이토 Intro/);
  assert.match(compact, /meeting_duration_minutes=60/);
  assert.match(compact, /meeting_confirmation=.*향후 2주/);
  assert.match(
    compact,
    /meeting_availability_url=https:\/\/matchharper\.com\/org\/settings/
  );
  assert.match(compact, /writing_instruction=Preserve meeting_confirmation/);
  assert.match(compact, /This preparation result is a preview/);
});

test("schedule decision exposes the human review destination", () => {
  const compact = serializeOrgAgentToolResult("decide_candidate_connection", {
    candidateName: "이토",
    changeSummary: "이토님과 연결했고 미팅 정보를 준비해두었어요.",
    connectionMethod: "schedule_interview",
    decision: "accept",
    meetingDraft: {
      config: {
        durationMinutes: 60,
        title: "Wonderful Japan <> 이토 Intro",
      },
    },
    meetingScheduleUrl:
      "https://matchharper.com/org/inbox?dialog=interview-schedule",
    roleName: "FDE",
    stage: "connected",
    status: "updated",
  });

  assert.match(
    compact,
    /meeting_schedule_url=https:\/\/matchharper\.com\/org\/inbox/
  );
  assert.match(compact, /user_facing_state=The candidate is connected/);
  assert.match(compact, /change=이토님과 연결했고 미팅 정보를 준비해두었어요/);
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
    instruction:
      "No new request was queued. Ask whether to cancel and replace it.",
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
  assert.match(compact, /cancel and replace/);
});

test("scheduled candidate contact keeps timing data without transport details", () => {
  const compact = serializeOrgAgentToolResult("contact_talent", {
    scheduledAt: "2026-08-27T23:00:00.000Z",
    status: "queued",
    userMessage:
      "지금은 시간이 늦어서, 김호진님께 내일 아침에 제가 대신 물어볼게요. 답이 오면 여기로 알려드릴게요.",
  });

  assert.match(compact, /scheduled_at=2026-08-27T23:00:00.000Z/);
  assert.match(compact, /내일 아침에/);
  assert.doesNotMatch(compact, /이메일|Harper 채팅|worker/i);
});

test("candidate contact drafts ask the model to write the confirmation", () => {
  const compact = serializeOrgAgentToolResult("contact_talent", {
    candidateName: "김호진",
    status: "draft",
    userMessage: "이 고정 fallback은 정상 응답에 복사하지 않습니다.",
  });

  assert.match(compact, /candidate=김호진/);
  assert.match(compact, /nothing_sent=true/);
  assert.match(compact, /exact_body_appended_by_server=true/);
  assert.match(compact, /Write the surrounding confirmation yourself/);
  assert.match(compact, /only one question mark/);
  assert.match(compact, /must not repeat the company name, Role title/);
  assert.match(compact, /prescribe exact reply words/);
  assert.match(compact, /copy a fixed template/);
  assert.doesNotMatch(compact, /이 고정 fallback/);
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
  assert.match(compact, /salary\t연봉 7,000만–9,000만원 \+ 스톡옵션/);
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

  assert.match(compact, /stage_id\tlabel\tkind\tsort_order/);
  assert.match(compact, /custom:stage-1\t1차 인터뷰\tcustom\t101/);
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

test("start_role_creation exposes the required continuation link and writing guidance", () => {
  const compact = serializeOrgAgentToolResult("start_role_creation", {
    roleId: "private-role-id",
    roleTitle: "Staff Engineer",
    requiredContinuationLink:
      "<https://slack.example/thread|새로운 채용 등록 이어가기>",
    responseExample: "네, Staff Engineer 역할 등록을 함께 시작할게요.",
    responseGuidance: "채용 파트너처럼 자연스럽게 안내해 주세요.",
    status: "started",
    threadPermalink: "https://slack.example/thread",
    webUrl: "https://harper.example/org/role?orgId=org&roleId=role",
  });

  assert.match(compact, /status=started/);
  assert.match(
    compact,
    /required_continuation_link=<https:\/\/slack\.example\/thread\|새로운 채용 등록 이어가기>/
  );
  assert.match(compact, /writing guidance|response_guidance/);
  assert.match(compact, /example is illustrative/i);
  assert.doesNotMatch(compact, /private-role-id/);
  assert.doesNotMatch(compact, /harper\.example/);
});
