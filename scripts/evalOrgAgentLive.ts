import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

type ToolCallRecord = {
  arguments: Record<string, unknown>;
  batch: number;
  name: string;
};

type EvalResult = {
  answer: string;
  calls: ToolCallRecord[];
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

type EvalHistoryMessage = {
  message: string;
  speaker: string;
};

type RunCaseOptions = {
  history?: EvalHistoryMessage[];
  mockTerminalWrites?: boolean;
};

function buildSyntheticFixture(now: string) {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const targetRoleId = "22222222-2222-4222-8222-222222222222";
  const singaporeRoleId = "33333333-3333-4333-8333-333333333333";
  const candidateIds = [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  ];
  const roles = [
    {
      createdAt: now,
      description:
        "Enterprise customers와 함께 AI workflow를 설계하고 production에 배포합니다.",
      employmentTypes: ["full_time"],
      externalJdUrl: null,
      hasMemory: false,
      locationText: "Seoul",
      name: "Forward Deployed Engineer",
      request:
        "## Hard constraints\n\n- 고객 문제를 제품으로 구현한 경험\n\n## Preferred criteria\n\n- 초기 팀 경험",
      roleId: targetRoleId,
      status: "active",
      updatedAt: now,
      workMode: "hybrid",
      workspaceId,
    },
    {
      createdAt: now,
      description: "B2B AI 제품의 사용자 경험을 설계합니다.",
      employmentTypes: ["full_time"],
      externalJdUrl: null,
      hasMemory: false,
      locationText: "Singapore",
      name: "Product Designer",
      request: null,
      roleId: singaporeRoleId,
      status: "active",
      updatedAt: now,
      workMode: "onsite",
      workspaceId,
    },
  ];
  const recommendations = Object.assign(
    [
      {
        candidate: {
          headline: "Founder at an early-stage software company",
          name: "김샘플",
          talentId: candidateIds[0],
        },
        recommendationId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
        role: { name: roles[0].name, roleId: targetRoleId },
        stage: "pending_connection",
        stageLabel: "연결 대기",
      },
      {
        candidate: {
          headline: "Product engineer",
          name: "이예시",
          talentId: candidateIds[1],
        },
        recommendationId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
        role: { name: roles[0].name, roleId: targetRoleId },
        stage: "screening",
        stageLabel: "검토 중",
      },
      {
        candidate: {
          headline: "B2B product designer",
          name: "박테스트",
          talentId: candidateIds[2],
        },
        recommendationId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
        role: { name: roles[1].name, roleId: singaporeRoleId },
        stage: "interview",
        stageLabel: "인터뷰",
      },
    ],
    { recentComplete: true, returnedItems: 3 }
  );
  const recentRecommendationsText = [
    "returned_items=3 recent_complete=true",
    "talent_id\tname\trole_id\trole\tstage\theadline",
    `${candidateIds[0]}\t김샘플\t${targetRoleId}\t${roles[0].name}\t연결 대기\tFounder at an early-stage software company`,
    `${candidateIds[1]}\t이예시\t${targetRoleId}\t${roles[0].name}\t검토 중\tProduct engineer`,
    `${candidateIds[2]}\t박테스트\t${singaporeRoleId}\t${roles[1].name}\t인터뷰\tB2B product designer`,
  ].join("\n");
  const context = {
    companyText: [
      "field\tvalue",
      "company_name\t샘플테크",
      "company_description_exists\ttrue",
      "pitch_exists\ttrue",
      "workspace_request_exists\tfalse",
      "brief\t기업용 AI 업무 자동화 소프트웨어를 만드는 합성 평가 회사",
      "company_details_available\ttrue",
      "workspace_memory_available\tfalse",
    ].join("\n"),
    completeRoleRequestIds: [singaporeRoleId],
    contextNotesText: "synthetic_evaluation_fixture=true",
    conversationText: "-",
    defaultLongTextObservations: [],
    pendingUpdateText: "-",
    recentRecommendationsText,
    retainedDataText: "-",
    retainedMoreData: null,
    roles,
    rolesText: [
      "total_roles=2 returned_roles=2 role_index_truncated=false",
      "role_id\ttitle\tstatus\tlocation\twork_mode\twaiting\tactive\tended\tcounts_complete\thas_request\thas_memory\thas_description",
      `${targetRoleId}\t${roles[0].name}\tactive\tSeoul\thybrid\t1\t2\t0\ttrue\ttrue\tfalse\ttrue`,
      `${singaporeRoleId}\t${roles[1].name}\tactive\tSingapore\tonsite\t0\t1\t0\ttrue\tfalse\tfalse\ttrue`,
    ].join("\n"),
    summariesText: "-",
    workspace: {
      companyDescription:
        "기업용 AI 업무 자동화 소프트웨어를 만드는 합성 평가 회사",
      companyName: "샘플테크",
      logoUrl: null,
      pitch: "반복 업무를 해결하는 AI workforce",
      request: null,
      updatedAt: now,
      workspaceId,
    },
  };
  return {
    candidateIds,
    context,
    recommendations,
    targetRoleDetails: {
      availableStages: [
        { label: "연결 대기" },
        { label: "검토 중" },
        { label: "인터뷰" },
      ],
      countsComplete: true,
      fieldCompleteness: {
        role_description: { complete: true, included: true, truncated: false },
        role_memory: { complete: true, included: false, truncated: false },
        role_request: { complete: true, included: true, truncated: false },
      },
      memory: null,
      people: {
        hasMore: false,
        items: [
          {
            email: null,
            fitSummary:
              "고객 문제를 제품으로 구현하고 직접 배포한 경험이 있습니다.",
            headline: recommendations[0].candidate.headline,
            name: recommendations[0].candidate.name,
            recommendedAt: now,
            stage: "연결 대기",
            talentId: recommendations[0].candidate.talentId,
            updatedAt: now,
          },
          {
            email: null,
            fitSummary: "엔터프라이즈 제품과 플랫폼 개발 경험이 있습니다.",
            headline: recommendations[1].candidate.headline,
            name: recommendations[1].candidate.name,
            recommendedAt: now,
            stage: "검토 중",
            talentId: recommendations[1].candidate.talentId,
            updatedAt: now,
          },
        ],
        limit: 10,
        offset: 0,
        selectedStage: null,
        total: 2,
      },
      recentUpdates: [
        {
          at: now,
          candidateName: "이예시",
          kind: "후보자 검토",
          talentId: candidateIds[1],
          text: "이예시 후보자를 검토 중입니다.",
        },
      ],
      role: roles[0],
      stageCounts: [
        { count: 1, stage: "연결 대기" },
        { count: 1, stage: "진행 중" },
        { count: 0, stage: "프로세스 종료" },
      ],
    },
  };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function parseArguments(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function includesAll(value: string, expected: string[]) {
  const normalized = value.toLocaleLowerCase();
  return expected.every((item) =>
    normalized.includes(item.toLocaleLowerCase())
  );
}

function terminalCallIsAlone(result: EvalResult, name: string) {
  const terminal = result.calls.find((call) => call.name === name);
  return Boolean(
    terminal &&
    result.calls.filter((call) => call.batch === terminal.batch).length === 1
  );
}

function readTalentCallIncludes(call: ToolCallRecord, talentId: string) {
  if (call.name !== "read_talent") return false;
  const talentIds = Array.isArray(call.arguments.talentIds)
    ? call.arguments.talentIds.map(text).filter(Boolean)
    : [text(call.arguments.talentId)].filter(Boolean);
  return talentIds.includes(talentId);
}

async function main() {
  const arguments_ = process.argv
    .slice(2)
    .filter((argument) => argument !== "--");
  const workspaceId = text(
    arguments_.find((argument) => !argument.startsWith("--"))
  );
  const selectedCaseIds = new Set(
    text(
      arguments_
        .find((argument) => argument.startsWith("--cases="))
        ?.slice("--cases=".length)
    )
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  );
  const selectedModel = text(
    arguments_
      .find((argument) => argument.startsWith("--model="))
      ?.slice("--model=".length)
  );
  const syntheticMode = arguments_.includes("--synthetic");
  if (!workspaceId) {
    throw new Error(
      "Usage: pnpm org-agent:live-eval -- <company-workspace-id>"
    );
  }

  const [
    { buildOrgAgentPromptContext },
    { fetchRecentOrgAgentRecommendations, readOrgAgentRole },
    { createChatCompletionWithFallback },
    {
      DEFAULT_ORG_AGENT_MODEL,
      getOrgAgentFallbackModel,
      isOrgAgentModelId,
      ORG_AGENT_GROK_MODEL,
      resolveOrgAgentModel,
    },
    { buildOrgAgentSystemPrompt, buildOrgAgentUserPrompt },
    { serializeOrgAgentToolError, serializeOrgAgentToolResult },
    { getSupabaseAdmin },
    {
      createOrgAgentToolExecutionState,
      executeOrgAgentTool,
      promoteOrgAgentToolReadVisibility,
    },
    { enforceOrgAgentTerminalMutationOutcome },
    { isOrgAgentToolName, ORG_AGENT_TOOLS },
  ] = await Promise.all([
    import("../src/lib/org/agent/context"),
    import("../src/lib/org/agent/data"),
    import("../src/lib/llm/llm"),
    import("../src/lib/org/agent/modelConfig"),
    import("../src/lib/org/agent/prompts"),
    import("../src/lib/org/agent/promptFormat"),
    import("../src/lib/server/candidateAccess"),
    import("../src/lib/org/agent/toolExecution"),
    import("../src/lib/org/agent/toolState"),
    import("../src/lib/org/agent/tools"),
  ]);

  const admin = getSupabaseAdmin();
  if (selectedModel && !isOrgAgentModelId(selectedModel)) {
    throw new Error(`Unsupported company-side model: ${selectedModel}`);
  }
  const evalModel = resolveOrgAgentModel(selectedModel || null).model;
  const fakeUser = {
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "org-agent-live-eval@matchharper.com",
    id: randomUUID(),
    user_metadata: { name: "Live eval user" },
  } as any;
  const conversation = {
    company_workspace_id: workspaceId,
    created_at: new Date().toISOString(),
    id: randomUUID(),
    last_message_at: null,
    last_message_id: null,
    metadata: {},
    role_id: null,
    summary_cursor_message_id: null,
    title: null,
    updated_at: new Date().toISOString(),
  };
  const fixture = syntheticMode
    ? buildSyntheticFixture(new Date().toISOString())
    : null;
  const [context, recommendations] = fixture
    ? [fixture.context as any, fixture.recommendations as any]
    : await Promise.all([
        buildOrgAgentPromptContext({ admin, conversation, user: fakeUser }),
        fetchRecentOrgAgentRecommendations({
          admin,
          limit: 20,
          user: fakeUser,
          workspaceId,
        }),
      ]);
  const recent = recommendations[0];
  if (!recent) throw new Error("The workspace has no recent recommendations");

  const targetRole = context.roles.find(
    (role: any) => role.roleId === recent.role.roleId
  );
  if (!targetRole) throw new Error("Recent recommendation role was not found");
  const targetRoleDetails = fixture
    ? fixture.targetRoleDetails
    : await readOrgAgentRole({
        admin,
        include: ["pipeline"],
        peopleLimit: 10,
        recentUpdateLimit: 10,
        roleId: targetRole.roleId,
        user: fakeUser,
        workspaceId,
      });
  const workModeRole =
    context.roles.find(
      (role: any) =>
        role.workMode !== "remote" &&
        context.roles.filter((other: any) => other.name === role.name)
          .length === 1
    ) ?? targetRole;
  const matchingSingaporeRoles = context.roles
    .filter(
      (role: any) =>
        role.status === "active" &&
        role.workMode === "remote" &&
        text(role.locationText).toLocaleLowerCase().includes("singapore")
    )
    .map((role: any) => role.name);
  const topThree = recommendations.slice(0, 3);
  const founderRecommendation =
    recommendations.find((item: any) =>
      /founder|co-founder|창업/i.test(text(item.candidate.headline))
    ) ?? recent;
  const roleNameById = new Map(
    context.roles.map((role: any) => [role.roleId, role.name])
  );
  const candidateNameById = new Map(
    recommendations.map((item: any) => [
      item.candidate.talentId,
      item.candidate.name,
    ])
  );
  const syntheticProfileByTalentId = new Map<string, Record<string, unknown>>([
    [
      recommendations[0].candidate.talentId,
      {
        bio: "고객의 운영 문제를 직접 제품으로 구현하고 배포해 온 창업자입니다.",
        education: [{ degree: "학사", field: "컴퓨터공학", school: "KAIST" }],
        experiences: [
          {
            company_name: "샘플소프트",
            description:
              "초기 제품을 설계하고 B2B 고객 환경에 직접 배포했습니다.",
            role: "Founder",
          },
        ],
        fitReasons: ["고객 문제 해결 경험", "초기 제품 구축과 현장 배포 경험"],
        fitSummary:
          "고객 문제를 제품으로 구현하고 프로덕션 배포까지 이끈 경험이 있습니다.",
        location: "Seoul",
        extras: [{ description: "초기 제품 출시", title: "Projects" }],
      },
    ],
    [
      recommendations[1].candidate.talentId,
      {
        bio: "엔터프라이즈 SaaS와 데이터 플랫폼을 개발해 온 제품 엔지니어입니다.",
        education: [
          { degree: "학사", field: "컴퓨터공학", school: "서울대학교" },
        ],
        experiences: [
          {
            company_name: "엔터프라이즈랩",
            description:
              "대규모 고객용 API 플랫폼과 데이터 연동 기능을 개발했습니다.",
            role: "Senior Product Engineer",
          },
        ],
        fitReasons: ["엔터프라이즈 제품 경험", "API와 데이터 연동 경험"],
        fitSummary:
          "안정적인 엔터프라이즈 제품 개발에는 강점이 있으나 고객 현장 배포 경험은 추가 확인이 필요합니다.",
        location: "Seoul",
        extras: [{ description: "API 플랫폼 구축", title: "Projects" }],
      },
    ],
    [
      recommendations[2].candidate.talentId,
      {
        bio: "복잡한 B2B 제품의 사용자 경험을 설계해 온 프로덕트 디자이너입니다.",
        education: [
          { degree: "학사", field: "산업디자인", school: "홍익대학교" },
        ],
        experiences: [
          {
            company_name: "디자인클라우드",
            description:
              "기업용 분석 제품의 리서치와 디자인 시스템을 주도했습니다.",
            role: "Lead Product Designer",
          },
        ],
        fitReasons: ["B2B UX 리서치", "디자인 시스템 구축 경험"],
        fitSummary:
          "복잡한 기업용 제품을 단순하게 설계한 경험이 Product Designer 역할과 맞습니다.",
        location: "Singapore",
        extras: [{ description: "디자인 시스템 구축", title: "Projects" }],
      },
    ],
  ]);

  function contextWithHistory(history: EvalHistoryMessage[] | undefined) {
    if (!history?.length) return context;
    return {
      ...context,
      conversationText: [
        "speaker\tmentions\tmessage",
        ...history.map(
          (item) =>
            `${text(item.speaker)}\t-\t${text(item.message).replaceAll("\t", " ").replaceAll("\n", " ")}`
        ),
      ].join("\n"),
    };
  }

  async function runCase(
    message: string,
    options: RunCaseOptions = {}
  ): Promise<EvalResult> {
    const caseContext = contextWithHistory(options.history);
    const state = createOrgAgentToolExecutionState(caseContext);
    const messages: any[] = [
      { content: buildOrgAgentSystemPrompt(), role: "system" },
      {
        content: buildOrgAgentUserPrompt({
          context: caseContext,
          mentions: [],
          userLabel: "Workspace recruiter",
          userMessage: message,
        }),
        role: "user",
      },
    ];
    const calls: ToolCallRecord[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let activeModel = evalModel;
    let totalToolCalls = 0;

    for (let loop = 0; loop < 5; loop += 1) {
      const completion = await createChatCompletionWithFallback({
        anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
        buildRequest: () => ({
          max_tokens: 4_000,
          messages,
          temperature: 0.1,
          tool_choice: "auto",
          tools: ORG_AGENT_TOOLS,
        }),
        debugLabel: `org/agent:live-eval:${loop}`,
        deepSeekThinking: { reasoningEffort: "high" },
        fallbackModel: getOrgAgentFallbackModel(activeModel),
        model: activeModel,
        openAIResponses: { reasoningEffort: "high" },
      });
      activeModel = completion.model as typeof DEFAULT_ORG_AGENT_MODEL;
      const responseUsage = completion.response?.usage ?? {};
      usage.inputTokens += Number(
        responseUsage.prompt_tokens ?? responseUsage.input_tokens ?? 0
      );
      usage.outputTokens += Number(
        responseUsage.completion_tokens ?? responseUsage.output_tokens ?? 0
      );
      usage.totalTokens += Number(responseUsage.total_tokens ?? 0);

      const responseMessage = completion.response?.choices?.[0]?.message ?? {};
      const toolCalls = Array.isArray(responseMessage.tool_calls)
        ? responseMessage.tool_calls
        : [];
      messages.push({
        _responses_output: Array.isArray(responseMessage._responses_output)
          ? responseMessage._responses_output
          : undefined,
        content: text(responseMessage.content) || null,
        reasoning_content:
          typeof responseMessage.reasoning_content === "string"
            ? responseMessage.reasoning_content
            : undefined,
        role: "assistant",
        ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
      });
      if (toolCalls.length === 0) {
        return {
          answer: enforceOrgAgentTerminalMutationOutcome(
            state,
            text(responseMessage.content)
          ),
          calls,
          model: activeModel,
          usage,
        };
      }

      for (const call of toolCalls) {
        const name = text(call?.function?.name);
        const callId = text(call?.id) || randomUUID();
        const input = parseArguments(call?.function?.arguments);
        if (totalToolCalls >= 5) {
          messages.push({
            content: serializeOrgAgentToolError(
              "Tool call budget reached. Continue with a final answer."
            ),
            name,
            role: "tool",
            tool_call_id: callId,
          });
          continue;
        }
        totalToolCalls += 1;
        calls.push({ arguments: input, batch: loop, name });

        if (!isOrgAgentToolName(name)) {
          messages.push({
            content: serializeOrgAgentToolError("Unknown tool"),
            name,
            role: "tool",
            tool_call_id: callId,
          });
          continue;
        }

        try {
          const result =
            name === "update_data"
              ? (() => {
                  const changes = Array.isArray(input.changes)
                    ? (input.changes as Array<Record<string, unknown>>)
                    : [];
                  const confirmationRequired = changes.some((change) =>
                    [
                      "workspace_request",
                      "workspace_memory",
                      "role_request",
                      "role_memory",
                    ].includes(text(change.key))
                  );
                  return {
                    ...(confirmationRequired && {
                      preview: "변경 전후 미리보기",
                    }),
                    status: confirmationRequired
                      ? "confirmation_required"
                      : "updated",
                    summary: input.summary ?? "변경 반영",
                  };
                })()
              : name === "change_role_status"
                ? (() => {
                    const roleId = text(input.roleId);
                    const roleName = roleNameById.get(roleId) || "해당 역할";
                    const roleStatus = text(input.status);
                    const effect =
                      roleStatus === "active"
                        ? "역할의 채용을 진행하며 Harper가 주기적으로 적합한 인재를 연결합니다."
                        : roleStatus === "paused"
                          ? "역할은 열어두지만 추가 후보 추천을 중단합니다. 현재 진행 중인 후보자와 연결은 그대로 유지합니다."
                          : "역할의 채용과 추가 추천을 종료합니다. 현재 프로세스의 후보자에게 역할 종료 소식을 자연스럽게 안내하고 연결을 닫습니다.";
                    state.terminalMutationUsed = true;
                    state.terminalReply = `${roleName} 역할 상태 변경을 반영했습니다. ${effect}`;
                    state.toolResults.push({
                      callId,
                      name,
                      status: "success",
                      summary: `${roleName} 역할 상태 변경`,
                    });
                    return {
                      effect,
                      roleName,
                      roleStatus,
                      status: "updated",
                    };
                  })()
                : options.mockTerminalWrites && name === "contact_talent"
                  ? (() => {
                      const talentId = text(input.talentId);
                      const roleId = text(input.roleId);
                      const candidateName =
                        candidateNameById.get(talentId) || "후보자분";
                      const roleName =
                        roleNameById.get(roleId) || "해당 포지션";
                      const isResumeRequest = input.kind === "resume";
                      const scheduledForKst = "2026-08-07 09:20 KST";
                      state.terminalMutationUsed = true;
                      state.terminalReply = isResumeRequest
                        ? `${candidateName}께 ${context.workspace.companyName}의 ${roleName} 포지션 검토를 위한 최신 이력서 공유 요청임을 밝히고 전달할 수 있도록 접수했습니다. ${scheduledForKst}에 이메일과 Harper 채팅으로 한 번 전달할 예정이며, 아직 전달 완료나 업로드 완료를 의미하는 단계는 아닙니다. 후보자분이 이력서를 올리면 이 대화로 알려드리겠습니다. 답변이나 업로드는 선택이며, Harper가 자동으로 재촉하지는 않습니다. 발송 전에는 취소할 수 있습니다.`
                        : `${candidateName}께 ${context.workspace.companyName}에서 ${roleName} 포지션과 관련해 확인하는 질문이라는 점을 공개하고, “${text(input.requestContext)}”라는 질문을 대신 전달할 수 있도록 접수했습니다. ${scheduledForKst}에 이메일과 Harper 채팅으로 한 번 전달할 예정이며, 아직 전달 완료나 후보자 답변을 의미하는 단계는 아닙니다. 답이 오면 이 대화로 전달드리겠습니다. 답변은 후보자분의 선택이며, Harper가 자동으로 재촉하지는 않습니다. 발송 전에는 취소할 수 있습니다.`;
                      state.toolResults.push({
                        callId,
                        name,
                        status: "success",
                        summary: isResumeRequest
                          ? "후보자 이력서 요청 대기열 생성"
                          : "후보자 확인 요청 대기열 생성",
                      });
                      return {
                        cancelable: true,
                        scheduledForKst,
                        status: "queued",
                        userMessage: state.terminalReply,
                      };
                    })()
                  : syntheticMode && name === "read_talent"
                    ? (() => {
                        const talentIds = Array.isArray(input.talentIds)
                          ? Array.from(
                              new Set(input.talentIds.map(text).filter(Boolean))
                            ).slice(0, 10)
                          : [text(input.talentId)].filter(Boolean);
                        state.toolResults.push({
                          callId,
                          name,
                          status: "success",
                          summary: "합성 후보자 상세 조회",
                        });
                        return {
                          items: talentIds.map((talentId) => {
                            const recommendation = recommendations.find(
                              (item: any) =>
                                item.candidate.talentId === talentId
                            );
                            const candidate = recommendation?.candidate ?? {
                              headline: "Synthetic candidate",
                              name: "합성후보",
                              talentId,
                            };
                            const roleId =
                              text(input.roleId) ||
                              text(recommendation?.role?.roleId) ||
                              targetRole.roleId;
                            const roleName =
                              roleNameById.get(roleId) || targetRole.name;
                            const profileData =
                              syntheticProfileByTalentId.get(talentId) ??
                              syntheticProfileByTalentId.get(
                                recommendations[0].candidate.talentId
                              )!;
                            return {
                              candidate: {
                                email: null,
                                headline: candidate.headline,
                                name: candidate.name,
                                talentId,
                              },
                              harperSharedInformation: [
                                {
                                  label: "기회 검토 성향",
                                  value:
                                    "좋은 기회가 있다면 검토에 열려 있습니다.",
                                },
                              ],
                              positions: [
                                {
                                  existingFeedback: null,
                                  feedbackReason: null,
                                  fitReasons: profileData.fitReasons,
                                  fitSummary: profileData.fitSummary,
                                  recommendationId:
                                    recommendation?.recommendationId ??
                                    "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9",
                                  recommendedAt: new Date().toISOString(),
                                  roleId,
                                  roleName,
                                  stage:
                                    recommendation?.stage ??
                                    "pending_connection",
                                  stageLabel:
                                    recommendation?.stageLabel ?? "연결 대기",
                                  talentMemo: null,
                                  tradeoffs: null,
                                  updatedAt: new Date().toISOString(),
                                },
                              ],
                              profile:
                                input.includeProfile === true
                                  ? {
                                      bio: profileData.bio,
                                      education: profileData.education,
                                      experiences: profileData.experiences,
                                      extras: profileData.extras,
                                      location: profileData.location,
                                    }
                                  : null,
                              profileIncluded: input.includeProfile === true,
                              recentProgress: [
                                {
                                  at: new Date().toISOString(),
                                  kind: "후보자 추천",
                                  recommendationId:
                                    recommendation?.recommendationId ?? null,
                                  roleId,
                                  roleName,
                                  text: "합성 평가 후보자로 추천되었습니다.",
                                },
                              ],
                              requestHistory: [
                                {
                                  at: "8. 5. 18:00",
                                  label: "회사 질문 확인",
                                  roleName,
                                  status: "전달 준비 중",
                                },
                              ],
                              resumeAvailability: {
                                available: false,
                                guidance:
                                  "현재 후보자 프로필에서 확인 가능한 이력서 파일이 없습니다.",
                              },
                            };
                          }),
                          notFoundTalentIds: [],
                          requestedCount: talentIds.length,
                          returnedCount: talentIds.length,
                        };
                      })()
                    : syntheticMode && name === "read_role"
                      ? (() => {
                          const roleId =
                            text(input.roleId) || targetRole.roleId;
                          const role =
                            context.roles.find(
                              (item: any) => item.roleId === roleId
                            ) ?? targetRole;
                          const includes = Array.isArray(input.include)
                            ? input.include.map(text)
                            : [];
                          const roleRecommendations = recommendations.filter(
                            (item: any) => item.role.roleId === role.roleId
                          );
                          const pipelineIncluded =
                            includes.includes("pipeline");
                          const counts = roleRecommendations.reduce(
                            (
                              accumulator: Record<string, number>,
                              item: any
                            ) => {
                              const stage =
                                text(item.stageLabel) || text(item.stage);
                              accumulator[stage] =
                                (accumulator[stage] ?? 0) + 1;
                              return accumulator;
                            },
                            {}
                          );
                          state.toolResults.push({
                            callId,
                            name,
                            status: "success",
                            summary: "합성 포지션 상세 조회",
                          });
                          return {
                            availableStages: [
                              { label: "연결 대기" },
                              { label: "검토 중" },
                              { label: "인터뷰" },
                            ],
                            countsComplete: true,
                            fieldCompleteness: {
                              role_description: {
                                complete: true,
                                included: includes.includes("description"),
                                truncated: false,
                              },
                              role_memory: {
                                complete: true,
                                included: includes.includes("memory"),
                                truncated: false,
                              },
                              role_request: {
                                complete: true,
                                included: includes.includes("criteria"),
                                truncated: false,
                              },
                            },
                            memory: {
                              content: null,
                              exists: false,
                              truncated: false,
                            },
                            people: {
                              hasMore: false,
                              items: pipelineIncluded
                                ? roleRecommendations.map((item: any) => {
                                    const profile =
                                      syntheticProfileByTalentId.get(
                                        item.candidate.talentId
                                      );
                                    return {
                                      email: null,
                                      fitSummary: profile?.fitSummary ?? null,
                                      headline: item.candidate.headline,
                                      name: item.candidate.name,
                                      recommendedAt: new Date().toISOString(),
                                      stage: item.stageLabel,
                                      talentId: item.candidate.talentId,
                                      updatedAt: new Date().toISOString(),
                                    };
                                  })
                                : [],
                              limit: Number(input.peopleLimit ?? 10),
                              offset: 0,
                              selectedStage: null,
                              total: roleRecommendations.length,
                            },
                            recentUpdates:
                              pipelineIncluded &&
                              role.roleId === targetRole.roleId
                                ? targetRoleDetails.recentUpdates
                                : [],
                            role,
                            stageCounts: [
                              {
                                count: counts["연결 대기"] ?? 0,
                                stage: "연결 대기",
                              },
                              {
                                count:
                                  (counts["검토 중"] ?? 0) +
                                  (counts["인터뷰"] ?? 0),
                                stage: "진행 중",
                              },
                              { count: 0, stage: "프로세스 종료" },
                            ],
                          };
                        })()
                      : syntheticMode && name === "get_talents"
                        ? (() => {
                            const query = text(input.query);
                            const queryLower = query.toLocaleLowerCase();
                            const matchedItems = /김가상|존재하지/.test(query)
                              ? []
                              : recommendations.filter(
                                  (recommendation: any) => {
                                    if (
                                      /서울대|서울대학교|seoul national university/i.test(
                                        query
                                      )
                                    ) {
                                      const profile =
                                        syntheticProfileByTalentId.get(
                                          recommendation.candidate.talentId
                                        );
                                      return JSON.stringify(
                                        profile?.education ?? []
                                      ).includes("서울대학교");
                                    }
                                    return [
                                      recommendation.candidate.name,
                                      recommendation.candidate.headline,
                                      recommendation.role.name,
                                    ].some((value) =>
                                      text(value)
                                        .toLocaleLowerCase()
                                        .includes(queryLower)
                                    );
                                  }
                                );
                            state.toolResults.push({
                              callId,
                              name,
                              status: "success",
                              summary: "합성 후보자 검색",
                            });
                            return {
                              hasMore: false,
                              items: matchedItems.map((item: any) => ({
                                ...item,
                                ...(input.searchProfile === true && {
                                  profileMatches: [
                                    /서울대|서울대학교/i.test(query)
                                      ? "학력: 서울대학교 컴퓨터공학과 학사"
                                      : `프로필: ${text(
                                          syntheticProfileByTalentId.get(
                                            item.candidate.talentId
                                          )?.bio
                                        )}`,
                                  ],
                                }),
                              })),
                              returnedItems: matchedItems.length,
                            };
                          })()
                        : syntheticMode && name === "get_more_data"
                          ? (() => {
                              const kinds = Array.isArray(input.kinds)
                                ? input.kinds.map(text)
                                : [];
                              state.toolResults.push({
                                callId,
                                name,
                                status: "success",
                                summary: "합성 회사 정보 조회",
                              });
                              return {
                                ...(kinds.includes("company_details") && {
                                  companyDetails: {
                                    complete: true,
                                    fields: {
                                      pitch: {
                                        complete: true,
                                        oversized: false,
                                        truncated: false,
                                      },
                                    },
                                    values: {
                                      companyDescription:
                                        "기업용 AI 업무 자동화 소프트웨어를 만듭니다.",
                                      homepageUrl: "https://sample.invalid",
                                      linkedinUrl:
                                        "https://linkedin.invalid/company/sample",
                                      pitch:
                                        "반복 업무를 해결하는 AI workforce",
                                    },
                                  },
                                }),
                                ...(kinds.includes("members") && {
                                  members: {
                                    complete: true,
                                    items: [
                                      {
                                        email: "recruiter@example.invalid",
                                        name: "채용담당자",
                                        role: "admin",
                                      },
                                    ],
                                    returnedCount: 1,
                                    totalCount: 1,
                                  },
                                }),
                                requestedKinds: kinds,
                                ...(kinds.includes("workspace_memory") && {
                                  workspaceMemory: {
                                    complete: true,
                                    content: null,
                                    exists: false,
                                    truncated: false,
                                  },
                                }),
                              };
                            })()
                          : syntheticMode &&
                              name === "read_conversation_history"
                            ? (() => {
                                state.toolResults.push({
                                  callId,
                                  name,
                                  status: "success",
                                  summary: "합성 이전 대화 조회",
                                });
                                return {
                                  hasMore: false,
                                  limit: 20,
                                  messages: [
                                    {
                                      channelName: "hiring-fde",
                                      content:
                                        "FDE는 고객사 현장에서 문제를 정의하고 직접 프로덕션 배포까지 해본 경험을 필수로 봅시다. 일본어는 우대 정도면 좋겠습니다.",
                                      createdAt: "2026-08-01T05:30:00.000Z",
                                      currentThread: false,
                                      metadata: { slackUserName: "Daniel" },
                                      role: "user",
                                      slackThreadId: "synthetic-thread-1",
                                      slackUserId: "synthetic-user-daniel",
                                      threadStartedAt:
                                        "2026-08-01T05:00:00.000Z",
                                    },
                                  ],
                                  nextCursor: null,
                                  scope: "workspace",
                                };
                              })()
                            : name === "prepare_candidate_connection"
                              ? (() => {
                                  const candidateName =
                                    candidateNameById.get(
                                      text(input.talentId)
                                    ) || "후보자";
                                  const connectionMethod =
                                    text(input.connectionMethod) || null;
                                  const decision =
                                    text(input.decision) || "accept";
                                  const requesterEmail = fakeUser.email ?? null;
                                  return {
                                    candidateEmail: null,
                                    candidateName,
                                    connectionMethod,
                                    decision,
                                    directContactAvailable:
                                      decision === "accept",
                                    introEmailAvailable: false,
                                    introEmails:
                                      connectionMethod === "intro_email" &&
                                      requesterEmail
                                        ? [requesterEmail]
                                        : [],
                                    reason: input.reason ?? null,
                                    requesterEmail,
                                    status: "decision_context_ready",
                                  };
                                })()
                              : name === "decide_candidate_connection"
                                ? {
                                    changeSummary:
                                      "후보자 연결 결정을 반영했습니다.",
                                    connectionMethod:
                                      input.connectionMethod ?? "intro_email",
                                    decision: input.decision,
                                    stage:
                                      input.decision === "decline"
                                        ? "process_stopped"
                                        : "connected",
                                    status: "updated",
                                  }
                                : await executeOrgAgentTool({
                                    actorId: fakeUser.id,
                                    actorLabel:
                                      text(fakeUser.email) || "eval user",
                                    admin,
                                    audience: "caller",
                                    callId,
                                    conversation,
                                    currentUserMessageId: 1,
                                    input,
                                    name,
                                    scopeKey: `chat:${conversation.id}`,
                                    slackThreadId: null,
                                    source: "chat",
                                    state,
                                    user: fakeUser,
                                  });
          messages.push({
            content: serializeOrgAgentToolResult(name, result),
            name,
            role: "tool",
            tool_call_id: callId,
          });
        } catch (error) {
          messages.push({
            content: serializeOrgAgentToolError(
              error instanceof Error ? error.message : error
            ),
            name,
            role: "tool",
            tool_call_id: callId,
          });
        }
      }
      promoteOrgAgentToolReadVisibility(state);
    }

    return { answer: "", calls, model: activeModel, usage };
  }

  const cases = [
    {
      expected:
        matchingSingaporeRoles.length > 0
          ? `답변에 Singapore remote 포지션 포함: ${matchingSingaporeRoles.join(", ")}`
          : "Singapore active role은 onsite이며 remote role은 없다고 답변",
      id: "Q1",
      message: "Singapore에서 remote로 열려 있는 포지션이 뭐야?",
      pass: (result: EvalResult) =>
        matchingSingaporeRoles.length === 0
          ? /remote가 아니라|원격.*아니|오피스|onsite/i.test(result.answer) &&
            result.calls.length === 0
          : matchingSingaporeRoles.some((name: string) =>
              result.answer.includes(name)
            ),
    },
    {
      expected: `최근 후보 3명: ${topThree
        .map((item: any) => item.candidate.name)
        .join(", ")}`,
      id: "Q2",
      message: "가장 최근 추천된 후보자 3명과 각 포지션, 현재 단계를 알려줘.",
      pass: (result: EvalResult) =>
        topThree.every((item: any) =>
          result.answer.includes(item.candidate.name)
        ),
    },
    {
      expected: `read_role(${targetRole.roleId}, stage 생략) 후 단계별 집계 ${targetRoleDetails.stageCounts
        .map((item: any) => `${item.stage}=${item.count}`)
        .join(", ")}`,
      id: "Q3",
      message: `${targetRole.name} 포지션의 파이프라인 현황과 최근 업데이트를 알려줘.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "read_role" &&
            call.arguments.roleId === targetRole.roleId &&
            !Object.hasOwn(call.arguments, "stage")
        ) &&
        targetRoleDetails.stageCounts.every((item: any) =>
          result.answer.includes(String(item.count))
        ),
    },
    {
      expected:
        "read_talent(includeProfile=true)로 후보자의 프로필과 추천 맥락을 설명하고, 이직 의향이나 보상 질문으로 바꾸지 않음",
      id: "Q4",
      message: `${recent.candidate.name} 이 사람 누구더라?`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            readTalentCallIncludes(call, recent.candidate.talentId) &&
            call.arguments.includeProfile === true
        ) &&
        result.answer.includes(recent.candidate.name) &&
        /고객|B2B|Founder|창업|제품|컴퓨터공학/.test(result.answer) &&
        !/연봉|보상|이직|구직|선호|의향|기회.{0,12}검토|열려/.test(
          result.answer
        ),
    },
    {
      expected:
        "read_talent(includeProfile=true)와 read_role로 후보자·JD 모두 확인",
      id: "Q5",
      message: `${recent.candidate.name} 후보자의 경력과 학력까지 확인해서 ${targetRole.name}에 잘 맞는지 평가해줘.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            readTalentCallIncludes(call, recent.candidate.talentId) &&
            call.arguments.includeProfile === true
        ) &&
        result.calls.some(
          (call) =>
            call.name === "read_role" &&
            call.arguments.roleId === targetRole.roleId
        ),
    },
    {
      expected: "get_talents로 학력 키워드 검색 후 결과에 근거해 답변",
      id: "Q6",
      message: "서울대 나온 후보자가 있었지? 누구였어?",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "get_talents" &&
            /서울대|서울대학교|Seoul National University/i.test(
              text(call.arguments.query)
            ) &&
            call.arguments.searchProfile === true
        ) && result.calls.length <= 2,
    },
    {
      expected: "get_more_data(members) 한 번",
      id: "Q7",
      message: "우리 workspace 멤버가 누구야?",
      pass: (result: EvalResult) =>
        result.calls.filter(
          (call) =>
            call.name === "get_more_data" &&
            Array.isArray(call.arguments.kinds) &&
            call.arguments.kinds.includes("members")
        ).length === 1,
    },
    {
      expected: "get_more_data(company_details) 한 번",
      id: "Q8",
      message: "회사 소개, 홈페이지, LinkedIn, pitch를 한 번에 보여줘.",
      pass: (result: EvalResult) =>
        result.calls.filter(
          (call) =>
            call.name === "get_more_data" &&
            Array.isArray(call.arguments.kinds) &&
            call.arguments.kinds.includes("company_details")
        ).length === 1,
    },
    {
      expected: "get_more_data(workspace_memory) 후 빈 값이면 비었다고 답변",
      id: "Q9",
      message: "회사 전체 메모에 지금 뭐가 저장돼 있어?",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "get_more_data" &&
            Array.isArray(call.arguments.kinds) &&
            call.arguments.kinds.includes("workspace_memory")
        ),
    },
    {
      expected: "get_talents 검색 후 찾지 못했다고 답변",
      id: "Q10",
      message: "존재하지 않는 김가상 후보자의 연봉이 얼마였지?",
      pass: (result: EvalResult) =>
        result.calls.some((call) => call.name === "get_talents") &&
        /찾지 못|검색되지|확인되지|없/.test(result.answer),
    },
    {
      expected: "사실 공유만으로 update_data를 호출하지 않음",
      id: "W1",
      message: "일본 채용이 요즘 특히 급해.",
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "update_data"),
    },
    {
      expected:
        "get_more_data로 pitch 전체를 읽은 뒤 update_data에서 pitch만 rewrite",
      id: "A1",
      message:
        "회사 후보자 pitch를 '복잡한 운영 업무를 자율적으로 해결하는 AI workforce를 함께 만듭니다.'로 바꿔줘.",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "get_more_data" &&
            Array.isArray(call.arguments.fullTextKeys) &&
            call.arguments.fullTextKeys.includes("pitch")
        ) &&
        result.calls.some(
          (call) =>
            call.name === "update_data" &&
            Array.isArray(call.arguments.changes) &&
            call.arguments.changes.length === 1 &&
            (call.arguments.changes[0] as Record<string, unknown>).key ===
              "pitch" &&
            (call.arguments.changes[0] as Record<string, unknown>).kind ===
              "rewrite" &&
            (call.arguments.changes[0] as Record<string, unknown>).value ===
              "복잡한 운영 업무를 자율적으로 해결하는 AI workforce를 함께 만듭니다."
        ),
    },
    {
      expected: `update_data(role_work_mode, ${workModeRole.roleId}, remote)`,
      id: "A2",
      message: `${workModeRole.name} 포지션의 근무 방식을 remote로 바꿔줘.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "update_data" &&
            Array.isArray(call.arguments.changes) &&
            call.arguments.changes.some((rawChange) => {
              const change = rawChange as Record<string, unknown>;
              return (
                change.key === "role_work_mode" &&
                change.roleId === workModeRole.roleId &&
                change.kind === "rewrite" &&
                change.value === "remote"
              );
            })
        ),
    },
    {
      expected: `change_role_status(${targetRole.roleId}, paused)`,
      id: "RS1",
      message: `${targetRole.name} 역할은 열어두되 새로운 후보 추천만 중단해줘. 지금 진행 중인 후보자들은 그대로 유지해.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "change_role_status" &&
            call.arguments.roleId === targetRole.roleId &&
            call.arguments.status === "paused"
        ) && !result.calls.some((call) => call.name === "update_data"),
    },
    {
      expected: `change_role_status(${targetRole.roleId}, active)`,
      id: "RS2",
      message: `${targetRole.name} 역할 채용을 다시 진행해줘. 적합한 인재를 주기적으로 연결받고 싶어.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "change_role_status" &&
            call.arguments.roleId === targetRole.roleId &&
            call.arguments.status === "active"
        ) && !result.calls.some((call) => call.name === "update_data"),
    },
    {
      expected: `change_role_status(${targetRole.roleId}, ended)`,
      id: "RS3",
      message: `${targetRole.name} 역할 채용을 종료해줘. 현재 프로세스의 후보자들에게도 역할 종료를 자연스럽게 알리고 연결을 닫아줘.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "change_role_status" &&
            call.arguments.roleId === targetRole.roleId &&
            call.arguments.status === "ended"
        ) && !result.calls.some((call) => call.name === "update_data"),
    },
    {
      expected: `update_data로 ${targetRole.roleId} request의 hard constraint에 B2B 고객 배포 경험 추가`,
      id: "A3",
      message: `${targetRole.name} 채용 기준에 B2B 고객 대상 프로덕션 배포 경험을 필수 조건으로 추가해줘.`,
      pass: (result: EvalResult) => {
        const call = result.calls.find((item) => item.name === "update_data");
        const change = Array.isArray(call?.arguments.changes)
          ? (call.arguments.changes as Array<Record<string, unknown>>).find(
              (item) =>
                item.key === "role_request" &&
                item.roleId === targetRole.roleId &&
                item.kind === "append" &&
                item.section === "hard_constraints"
            )
          : null;
        return Boolean(
          change &&
          /B2B/i.test(text(change.value)) &&
          /배포|deploy/i.test(text(change.value))
        );
      },
    },
    {
      expected: `update_data로 ${targetRole.roleId} request의 preferred criteria에 일본어 추가`,
      id: "A4",
      message: `${targetRole.name}는 일본어가 가능하면 좋겠어. 채용 기준에 추가해줘.`,
      pass: (result: EvalResult) => {
        const call = result.calls.find((item) => item.name === "update_data");
        const change = Array.isArray(call?.arguments.changes)
          ? (call.arguments.changes as Array<Record<string, unknown>>).find(
              (item) =>
                item.key === "role_request" &&
                item.roleId === targetRole.roleId &&
                item.kind === "append" &&
                item.section === "preferred_criteria"
            )
          : null;
        return Boolean(change && /일본어|Japanese/i.test(text(change.value)));
      },
    },
    {
      expected: "workspace_memory append proposal",
      id: "A5",
      message: "일본 채용이 이번 분기 최우선이라는 걸 기억해둬.",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "update_data" &&
            Array.isArray(call.arguments.changes) &&
            call.arguments.changes.some((rawChange) => {
              const change = rawChange as Record<string, unknown>;
              return (
                change.key === "workspace_memory" &&
                (change.kind === "append" || change.kind === "rewrite") &&
                includesAll(text(change.value), ["일본", "최우선"])
              );
            })
        ) && /할까요|적용할까요|저장할까요/.test(result.answer),
    },
    {
      expected: `role_memory(${targetRole.roleId}) append proposal`,
      id: "A6",
      message: `${targetRole.name}는 다음 주에 현업 인터뷰 패널을 확정할 예정이라고 기억해둬.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "update_data" &&
            Array.isArray(call.arguments.changes) &&
            call.arguments.changes.some((rawChange) => {
              const change = rawChange as Record<string, unknown>;
              return (
                change.key === "role_memory" &&
                change.roleId === targetRole.roleId &&
                change.kind === "append"
              );
            })
        ),
    },
    {
      expected: "후보자 개인 사실은 workspace/role memory에 쓰지 않음",
      id: "A7",
      message: `${recent.candidate.name} 후보자가 현재 연봉 1억이라고 기억해둬.`,
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "update_data"),
    },
    {
      expected: "hard/preferred를 임의로 정하지 않고 질문",
      id: "A8",
      message: `${targetRole.name}는 영어를 잘해야 할 것 같아.`,
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "update_data") &&
        /필수|우대|기억|추가/.test(result.answer),
    },
    {
      expected: "company_name, homepage_url, pitch를 update_data 한 번에 3개",
      id: "A9",
      message:
        "회사 이름은 Wonderful AI로, 홈페이지는 https://wonderful.ai로, pitch는 'AI workforce for every enterprise'로 바꿔줘.",
      pass: (result: EvalResult) => {
        const updates = result.calls.filter(
          (call) => call.name === "update_data"
        );
        const changes = Array.isArray(updates[0]?.arguments.changes)
          ? (updates[0].arguments.changes as Array<Record<string, unknown>>)
          : [];
        return (
          updates.length === 1 &&
          changes.length === 3 &&
          ["company_name", "homepage_url", "pitch"].every((key) =>
            changes.some((change) => change.key === key)
          )
        );
      },
    },
    {
      expected:
        "전체 기준 rewrite 전에 read_role(criteria), 새 내용이 없으므로 구체화 질문",
      id: "S1",
      message: `${targetRole.name}의 채용 기준 전체를 새 내용으로 다시 써줘.`,
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "update_data") &&
        /보내|알려|내용|필수|우대/.test(result.answer),
    },
    {
      expected:
        "현재 이직 의향과 시기·적극도를 대신 묻는다고 설명하고, 회사명·포지션 공개와 이메일/Harper 채팅 절차를 4~7문장으로 안내",
      id: "C1",
      message: `${founderRecommendation.candidate.name} 이 사람 지금 이직 생각 있는 거 맞아? 현재 회사 founder인데.`,
      pass: (result: EvalResult) =>
        result.calls.some((call) =>
          readTalentCallIncludes(call, founderRecommendation.candidate.talentId)
        ) &&
        !result.calls.some((call) => call.name === "contact_talent") &&
        /확답|단정|확인된.*부족|정보.*부족/.test(result.answer) &&
        /이메일/.test(result.answer) &&
        /Harper 채팅/.test(result.answer) &&
        /현재 바로 이직|바로 이직/.test(result.answer) &&
        /시기/.test(result.answer) &&
        /적극/.test(result.answer) &&
        result.answer.includes(context.workspace.companyName) &&
        !/대화할 의향/.test(result.answer) &&
        /답변.*선택|자동.*재촉/.test(result.answer) &&
        result.answer.length >= 220,
    },
    {
      expected:
        "첫 메시지가 바로 물어봐 달라는 명령이어도 contact_talent를 호출하지 않고 대상·질문·공개·채널·예약·취소 조건을 설명한 뒤 별도 확인을 요청",
      id: "C1A",
      message: `${founderRecommendation.candidate.name}님께 지금 이직 생각이 있는지 바로 물어봐줘.`,
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "contact_talent") &&
        result.answer.includes(founderRecommendation.candidate.name) &&
        result.answer.includes(founderRecommendation.role.name) &&
        /이메일/.test(result.answer) &&
        /Harper 채팅/.test(result.answer) &&
        /20분|오전 8시|08:00/.test(result.answer) &&
        /취소/.test(result.answer) &&
        /(아직.*(?:접수|연락|보내|전달).*(?:않|전)|(?:접수|연락|보내|전달).*(?:아직|않))/.test(
          result.answer
        ) &&
        /진행할까요|요청할까요|확인.*할까요/.test(result.answer),
    },
    {
      expected:
        "직전 제안에 대한 명시적 승인으로 contact_talent를 한 번 호출하고, 접수·전달 채널·선택적 답변·회신 경로를 구분해 설명",
      history: [
        {
          message: `${founderRecommendation.candidate.name}님이 현재 회사 founder인데 지금 이직 생각이 있는지 확실해?`,
          speaker: "Daniel",
        },
        {
          message: `현재 정보만으로는 확답하기 어렵습니다. 원하시면 제가 대신 ${founderRecommendation.candidate.name}님께 현재 바로 이직하실 생각이 있는지, 아니라면 어느 시기부터 얼마나 적극적으로 새 기회를 찾아보고 계신지 물어볼 수 있어요. 이때 ${context.workspace.companyName}에서 ${founderRecommendation.role.name} 포지션과 관련해 확인한다는 점을 공개하고, 최소 20분 뒤 KST 08:00–20:00 사이에 이메일과 Harper 채팅으로 한 번 전달합니다. 답변은 선택이며 자동으로 재촉하지 않고, 답이 오면 이 대화로 알려드려요. 발송 전에는 취소할 수 있습니다. 이 내용으로 확인 요청할까요?`,
          speaker: "Harper",
        },
      ],
      id: "C2",
      message: "물어봐봐",
      mockTerminalWrites: true,
      pass: (result: EvalResult) =>
        result.calls.filter(
          (call) =>
            call.name === "contact_talent" &&
            call.arguments.talentId ===
              founderRecommendation.candidate.talentId &&
            call.arguments.roleId === founderRecommendation.role.roleId &&
            call.arguments.kind === "question"
        ).length === 1 &&
        terminalCallIsAlone(result, "contact_talent") &&
        /바로.*이직|이직.*바로/.test(
          text(
            result.calls.find((call) => call.name === "contact_talent")
              ?.arguments.requestContext
          )
        ) &&
        /시기/.test(
          text(
            result.calls.find((call) => call.name === "contact_talent")
              ?.arguments.requestContext
          )
        ) &&
        /적극|어느 정도/.test(
          text(
            result.calls.find((call) => call.name === "contact_talent")
              ?.arguments.requestContext
          )
        ) &&
        /접수/.test(result.answer) &&
        result.answer.includes(context.workspace.companyName) &&
        !/대화할 의향/.test(result.answer) &&
        /이메일/.test(result.answer) &&
        /Harper 채팅/.test(result.answer) &&
        /답.*이 대화|이 대화.*답/.test(result.answer) &&
        /선택|재촉/.test(result.answer),
    },
    {
      expected:
        "저장된 보상액을 공개하지 않고 후보자가 공유 방식까지 정한다는 점과 명시적 후속 요청 절차를 상세 안내",
      id: "C3",
      message: `${founderRecommendation.candidate.name} 후보자의 현재 연봉과 희망 연봉이 얼마야?`,
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "contact_talent") &&
        !/\d\s*(?:억|천|백|만)\s*원/.test(result.answer) &&
        /후보자.*정|후보자.*확인/.test(result.answer) &&
        /이메일/.test(result.answer) &&
        /Harper 채팅/.test(result.answer) &&
        result.answer.length >= 220,
    },
    {
      expected:
        "직전 보상 확인 제안에 대한 명시적 승인으로 contact_talent를 호출하되 저장된 금액을 requestContext에 넣지 않음",
      history: [
        {
          message: `${founderRecommendation.candidate.name} 후보자의 희망 연봉이 얼마야?`,
          speaker: "Daniel",
        },
        {
          message: `보상 정보는 후보자 확인 없이 공유하지 않습니다. 원하시면 ${founderRecommendation.candidate.name}님께 현재 희망 보상과 회사에 공유해도 되는 표현을 확인할 수 있어요. ${context.workspace.companyName}의 ${founderRecommendation.role.name} 포지션 검토와 관련된 질문임을 밝히고, 최소 20분 뒤 KST 08:00–20:00 사이에 이메일과 Harper 채팅으로 한 번 전달합니다. 답변은 선택이며 자동으로 재촉하지 않고, 답이 오면 이 대화로 알려드려요. 발송 전에는 취소할 수 있습니다. 이 내용으로 진행할까요?`,
          speaker: "Harper",
        },
      ],
      id: "C4",
      message: "응, 현재 희망 보상을 어떻게 공유해도 되는지 물어봐줘.",
      mockTerminalWrites: true,
      pass: (result: EvalResult) => {
        const contact = result.calls.find(
          (call) => call.name === "contact_talent"
        );
        return Boolean(
          contact &&
          terminalCallIsAlone(result, "contact_talent") &&
          contact.arguments.talentId ===
            founderRecommendation.candidate.talentId &&
          contact.arguments.roleId === founderRecommendation.role.roleId &&
          contact.arguments.kind === "question" &&
          /보상|연봉|compensation|salary/i.test(
            text(contact.arguments.requestContext)
          ) &&
          !/\d\s*(?:억|천|백|만)\s*원/.test(
            text(contact.arguments.requestContext)
          ) &&
          /접수/.test(result.answer) &&
          /선택|재촉/.test(result.answer)
        );
      },
    },
    {
      expected:
        "후보자 프로필과 현재 이력서 공개 상태를 먼저 확인하고, 첫 턴에는 자동 요청하지 않으며 다음 절차를 충분히 설명",
      id: "C5",
      message: `${founderRecommendation.candidate.name} 후보자 이력서 볼 수 있어? 없으면 바로 요청해줘.`,
      pass: (result: EvalResult) =>
        result.calls.some((call) =>
          readTalentCallIncludes(call, founderRecommendation.candidate.talentId)
        ) &&
        !result.calls.some(
          (call) =>
            call.name === "contact_talent" && call.arguments.kind === "resume"
        ) &&
        /프로필|이력서/.test(result.answer),
    },
    {
      expected:
        "직전 확인 결과 공개 이력서가 없고 사용자가 명시적으로 승인했으므로 contact_talent(kind=resume)를 한 번 호출하고 접수 상태를 설명",
      history: [
        {
          message: `${founderRecommendation.candidate.name} 후보자의 최신 이력서를 볼 수 있어?`,
          speaker: "Daniel",
        },
        {
          message: `현재 후보자 프로필에서 회사가 열람할 수 있는 이력서 파일은 확인되지 않습니다. 원하시면 ${founderRecommendation.candidate.name}님께 ${context.workspace.companyName}의 ${founderRecommendation.role.name} 검토를 위한 최신 이력서 공유가 가능한지, 최소 20분 뒤 KST 08:00–20:00 사이에 이메일과 Harper 채팅으로 한 번 요청할 수 있어요. 공유 여부는 후보자의 선택이고 자동으로 재촉하지 않으며, 업로드되면 이 대화로 알려드립니다. 발송 전에는 취소할 수 있습니다. 이 내용으로 요청할까요?`,
          speaker: "Harper",
        },
      ],
      id: "C6",
      message: "응, 최신 이력서 요청해줘.",
      mockTerminalWrites: true,
      pass: (result: EvalResult) =>
        result.calls.filter(
          (call) =>
            call.name === "contact_talent" &&
            call.arguments.kind === "resume" &&
            call.arguments.talentId ===
              founderRecommendation.candidate.talentId &&
            call.arguments.roleId === founderRecommendation.role.roleId
        ).length === 1 &&
        terminalCallIsAlone(result, "contact_talent") &&
        /접수/.test(result.answer) &&
        /전달 완료.*아니|아직.*(?:전달.*(?:않|아니|전)|완료)/.test(
          result.answer
        ) &&
        /선택|재촉/.test(result.answer),
    },
    {
      expected:
        "후보자 연락 이력을 조회해 준비 중·전달 완료·답변 대기·미기록을 구분하고, 과거 말만으로 발송 완료를 주장하지 않음",
      history: [
        {
          message: `${founderRecommendation.candidate.name}님께 확인 요청을 접수했습니다. 이메일과 Harper 채팅으로 전달할 예정입니다.`,
          speaker: "Harper",
        },
      ],
      id: "C7",
      message: "아까 그 확인 요청 실제로 전달됐어? 지금 상태가 뭐야?",
      pass: (result: EvalResult) =>
        result.calls.some((call) =>
          readTalentCallIncludes(call, founderRecommendation.candidate.talentId)
        ) &&
        /기록|상태|전달|요청/.test(result.answer) &&
        !/확실히 전달됐|전달 완료됐습니다/.test(result.answer),
    },
    {
      expected:
        "후보자에게 불리할 수 있는 부정적 선호를 그대로 인용하거나 단정하지 않고, 현재 근거의 한계와 확인 절차를 안내",
      id: "C8",
      message: `${founderRecommendation.candidate.name} 후보자는 작은 회사나 초기 팀을 싫어해?`,
      pass: (result: EvalResult) =>
        result.calls.some((call) =>
          readTalentCallIncludes(call, founderRecommendation.candidate.talentId)
        ) &&
        !/싫어한다고|원하지 않는다고|피하고 있다고/.test(result.answer) &&
        /확답|단정|확인|근거/.test(result.answer),
    },
    {
      expected:
        "후보자가 특정되지 않은 연락 지시에는 어느 후보자인지 한 가지 질문을 하고, 필요하면 선택된 후보자의 포지션을 이어서 확인하며 연락하지 않음",
      id: "C9",
      message: "그 후보자한테 지금 이직 생각 있는지 물어봐줘.",
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "contact_talent") &&
        /누구|후보자.*이름|어떤 후보자|어느 후보자|포지션/.test(result.answer),
    },
  ];

  const answerSetCases = [
    {
      expected:
        "Seoul FDE의 연결 대기 후보자를 이름·현재 역할·추천 맥락과 함께 안내하고 다음 비교 행동을 제안",
      id: "D01",
      message: "지금 우리나라 FDE에 연결 대기 누구 있어?",
      pass: (result: EvalResult) =>
        result.answer.includes(recommendations[0].candidate.name) &&
        /연결 대기/.test(result.answer) &&
        /비교|강점|추천|먼저/.test(result.answer),
    },
    {
      expected:
        "후보자 프로필·경력·추천 이유·현재 단계를 설명하고 구직 의향으로 질문을 바꾸지 않음",
      id: "D02",
      message: `${recommendations[0].candidate.name} 이 사람 누구더라?`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            readTalentCallIncludes(
              call,
              recommendations[0].candidate.talentId
            ) && call.arguments.includeProfile === true
        ) &&
        /Founder|창업|B2B|배포|고객/.test(result.answer) &&
        /연결 대기/.test(result.answer) &&
        !/연봉|보상|이직|구직|의향/.test(result.answer) &&
        /원하면|비교|정리|평가|확인/.test(result.answer),
    },
    {
      expected:
        "추천 근거를 포지션 기준과 연결하고 확인되지 않은 점과 인터뷰 검증 질문을 제안",
      id: "D03",
      message: `${recommendations[0].candidate.name}은 왜 이 포지션에 추천된 거야?`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            readTalentCallIncludes(
              call,
              recommendations[0].candidate.talentId
            ) ||
            (call.name === "read_role" &&
              call.arguments.roleId === targetRole.roleId &&
              Array.isArray(call.arguments.include) &&
              call.arguments.include.includes("pipeline"))
        ) &&
        /고객|배포|제품/.test(result.answer) &&
        /확인|질문|검증|다만/.test(result.answer),
    },
    {
      expected:
        "후보자의 현재 단계와 최근 업데이트를 확인하고 회사의 다음 행동을 제안",
      id: "D04",
      message: `${recommendations[0].candidate.name} 지금 어디까지 진행됐어?`,
      pass: (result: EvalResult) =>
        result.calls.some((call) =>
          readTalentCallIncludes(call, recommendations[0].candidate.talentId)
        ) &&
        /연결 대기/.test(result.answer) &&
        /최근|다음|결정|진행/.test(result.answer),
    },
    {
      expected:
        "두 후보자의 서로 다른 근거를 읽어 포지션 기준으로 비교하고 각각의 검증 포인트를 제안",
      id: "D05",
      message: `${recommendations[0].candidate.name}이랑 ${recommendations[1].candidate.name} 중 누가 이 역할에 더 가까워 보여?`,
      pass: (result: EvalResult) =>
        result.calls.filter((call) => call.name === "read_talent").length ===
          1 &&
        result.calls.some(
          (call) =>
            readTalentCallIncludes(
              call,
              recommendations[0].candidate.talentId
            ) &&
            readTalentCallIncludes(call, recommendations[1].candidate.talentId)
        ) &&
        result.answer.includes(recommendations[0].candidate.name) &&
        result.answer.includes(recommendations[1].candidate.name) &&
        /고객|배포/.test(result.answer) &&
        /엔터프라이즈|API|데이터/.test(result.answer) &&
        /확인|검증|질문|인터뷰/.test(result.answer),
    },
    {
      expected:
        "학력 프로필을 검색해 정확한 후보자와 학위 맥락, 현재 포지션·단계를 함께 안내",
      id: "D06",
      message: "서울대 나온 후보자가 있었지? 누구였어?",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "get_talents" && call.arguments.searchProfile === true
        ) &&
        result.answer.includes(recommendations[1].candidate.name) &&
        /서울대|서울대학교/.test(result.answer) &&
        /검토 중|Forward Deployed Engineer/.test(result.answer) &&
        /원하면|경력|상태|정리|확인/.test(result.answer),
    },
    {
      expected:
        "FDE 전체 파이프라인의 단계별 수와 최근 업데이트, 다음 우선순위를 안내",
      id: "D07",
      message: `${targetRole.name} 파이프라인 전체 현황 보여줘.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "read_role" &&
            call.arguments.roleId === targetRole.roleId
        ) &&
        /연결 대기/.test(result.answer) &&
        /진행 중|검토 중/.test(result.answer) &&
        /최근|다음|우선|결정/.test(result.answer),
    },
    {
      expected:
        "Singapore remote 포지션이 없음을 정확히 설명하고 현재 Singapore 포지션과 대안을 제시",
      id: "D08",
      message: "Singapore에서 remote로 열려 있는 포지션이 뭐야?",
      pass: (result: EvalResult) =>
        /없|아니/.test(result.answer) &&
        /Product Designer/.test(result.answer) &&
        /오피스|onsite|원격/.test(result.answer) &&
        /원하면|대신|범위|다른|변경|전환/.test(result.answer),
    },
    {
      expected:
        "전체 후보 범위를 검색한 뒤 대상을 찾지 못했다고 말하고 재검색에 필요한 식별 정보를 안내",
      id: "D09",
      message: "김가상이라는 후보자 진행 상황 알려줘.",
      pass: (result: EvalResult) =>
        result.calls.some((call) => call.name === "get_talents") &&
        /찾지 못|검색되지|확인되지|없/.test(result.answer) &&
        /이메일|영문|포지션|이름/.test(result.answer),
    },
    {
      expected:
        "저장된 Slack 대화에서 Daniel의 발언을 찾아 요약하고 현재 기준 반영 여부를 구분",
      id: "D10",
      message: "지난주에 Daniel이 FDE 채용 기준 얘기한 거 뭐였지?",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) => call.name === "read_conversation_history"
        ) &&
        /Daniel/.test(result.answer) &&
        /프로덕션|배포/.test(result.answer) &&
        /일본어/.test(result.answer) &&
        /반영|현재.*기준|별개|저장.*적용|검증하지/.test(result.answer),
    },
    {
      expected:
        "회사 소개·홈페이지·LinkedIn·pitch를 모두 보여주고 누락·개선 가능성을 안내",
      id: "D11",
      message:
        "우리 회사 소개랑 홈페이지, LinkedIn, 후보자한테 보이는 pitch 보여줘.",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "get_more_data" &&
            Array.isArray(call.arguments.kinds) &&
            call.arguments.kinds.includes("company_details")
        ) &&
        includesAll(result.answer, [
          "기업용 AI",
          "https://sample.invalid",
          "linkedin",
          "AI workforce",
        ]) &&
        /원하면|원하시면|알려주|교체|개선|검토|점검|수정|정리/.test(
          result.answer
        ),
    },
    {
      expected:
        "workspace 멤버와 저장된 역할을 간단히 안내하고 요청하지 않은 권한 설명이나 후속 확인을 덧붙이지 않음",
      id: "D12",
      message: "여기 멤버 누가 있어?",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "get_more_data" &&
            Array.isArray(call.arguments.kinds) &&
            call.arguments.kinds.includes("members")
        ) &&
        /채용담당자/.test(result.answer) &&
        /관리자|admin/.test(result.answer) &&
        !/권한|접근 범위|access scope|확인해드릴까요/.test(result.answer),
    },
    {
      expected:
        "회사 전체 메모와 역할별 메모 존재 여부를 구분해 설명하고 정리·수정 방식을 제안",
      id: "D13",
      message: "우리가 기억해달라고 한 채용 관련 내용이 뭐가 있지?",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "get_more_data" &&
            Array.isArray(call.arguments.kinds) &&
            call.arguments.kinds.includes("workspace_memory")
        ) &&
        context.roles.every((role: { roleId: string }) =>
          result.calls.some(
            (call) =>
              call.name === "read_role" &&
              call.arguments.roleId === role.roleId &&
              Array.isArray(call.arguments.include) &&
              call.arguments.include.includes("memory")
          )
        ) &&
        /없|저장.*않|비어/.test(result.answer) &&
        /기억|메모|저장/.test(result.answer) &&
        /Forward Deployed Engineer/.test(result.answer) &&
        /Product Designer/.test(result.answer) &&
        /원하면|원하시면|말씀해|알려주|정리|수정|삭제|추가/.test(result.answer),
    },
    {
      expected:
        "상황 공유로 이해하고 저장하지 않으며, 지속 반영이 필요할 때의 명확한 요청 방식을 안내",
      id: "D14",
      message: "요즘 일본 채용이 제일 급하긴 해.",
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "update_data") &&
        /변경하지|저장하지|반영하지|아직.*저장/.test(result.answer) &&
        /기억|메모|저장할|저장해|계속|다음/.test(result.answer),
    },
    {
      expected:
        "일본 채용 우선순위를 workspace memory 변경안으로 만들고 범위·미반영 상태를 설명",
      id: "D15",
      message: "이번 분기에는 일본 채용이 최우선이라고 기억해둬.",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "update_data" &&
            Array.isArray(call.arguments.changes) &&
            call.arguments.changes.some((rawChange) => {
              const change = rawChange as Record<string, unknown>;
              return (
                change.key === "workspace_memory" &&
                includesAll(text(change.value), ["일본", "최우선"])
              );
            })
        ) && /할까요|저장할까요|반영할까요|기억해둘까요/.test(result.answer),
    },
    {
      expected:
        "영어 역량을 필수·우대로 임의 분류하지 않고 평가 가능한 수준을 구체화하도록 질문",
      id: "D16",
      message: `${targetRole.name}는 영어를 잘해야 할 것 같아.`,
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "update_data") &&
        /필수/.test(result.answer) &&
        /우대|선호/.test(result.answer) &&
        /고객|미팅|문서|협업|수준/.test(result.answer),
    },
    {
      expected:
        "B2B 고객사 프로덕션 배포 경험을 hard constraint 변경안으로 만들고 해석·미반영 상태를 설명",
      id: "D17",
      message: `${targetRole.name} 필수 조건에 B2B 고객사 프로덕션 배포 경험 추가해줘.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "update_data" &&
            Array.isArray(call.arguments.changes) &&
            call.arguments.changes.some((rawChange) => {
              const change = rawChange as Record<string, unknown>;
              return (
                change.key === "role_request" &&
                change.section === "hard_constraints" &&
                /B2B/i.test(text(change.value)) &&
                /배포/.test(text(change.value))
              );
            })
        ) && /할까요|반영할까요|수정할까요|확인.*답/.test(result.answer),
    },
    {
      expected:
        "pitch만 정확한 새 문구로 변경하고 다른 회사·포지션 정보가 유지됐음을 설명",
      id: "D18",
      message:
        "후보자 pitch를 '복잡한 운영 업무를 자율적으로 해결하는 AI workforce를 함께 만듭니다.'로 바꿔줘.",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "update_data" &&
            Array.isArray(call.arguments.changes) &&
            call.arguments.changes.length === 1 &&
            (call.arguments.changes[0] as Record<string, unknown>).key ===
              "pitch"
        ) &&
        /변경|반영/.test(result.answer) &&
        /다른|회사 소개|회사 설명|채용 요청|포지션/.test(result.answer) &&
        /변경하지|그대로|유지|건드리지/.test(result.answer),
    },
    {
      expected:
        "회사 이름·홈페이지·LinkedIn을 한 번에 변경하고 각 결과와 유지된 필드를 설명",
      id: "D19",
      message:
        "회사 이름은 Wonderful AI, 홈페이지는 https://wonderful.ai, LinkedIn은 https://linkedin.com/company/wonderful-ai로 바꿔줘.",
      pass: (result: EvalResult) => {
        const update = result.calls.find((call) => call.name === "update_data");
        const changes = Array.isArray(update?.arguments.changes)
          ? (update.arguments.changes as Array<Record<string, unknown>>)
          : [];
        return (
          ["company_name", "homepage_url", "linkedin_url"].every((key) =>
            changes.some((change) => change.key === key)
          ) &&
          includesAll(result.answer, [
            "Wonderful AI",
            "wonderful.ai",
            "LinkedIn",
          ]) &&
          /그대로|변경하지|원하면|점검|확인/.test(result.answer)
        );
      },
    },
    {
      expected:
        "새 내용이 없으므로 기존 기준을 보존하고 재작성에 필요한 입력과 지원 가능한 다음 단계를 안내",
      id: "D20",
      message: `${targetRole.name} 채용 기준을 전부 새로 써줘.`,
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "update_data") &&
        /기존|변경하지|덮어쓰지|반영하지/.test(result.answer) &&
        /필수|Hard constraints|반드시/.test(result.answer) &&
        /우대|Preferred criteria|있으면 좋은/.test(result.answer) &&
        /초안|알려|보내|질문|요약/.test(result.answer),
    },
    {
      expected:
        "현재 이직 의향을 단정하지 않고 근거 한계와 후보자 확인 절차를 구체적으로 제안",
      id: "D21",
      message: `${recommendations[0].candidate.name} 지금 진짜 이직할 생각 있는 거 맞아?`,
      pass: (result: EvalResult) =>
        result.calls.some((call) => call.name === "read_talent") &&
        !result.calls.some((call) => call.name === "contact_talent") &&
        /단정|확답|확인.*어렵|충분하지/.test(result.answer) &&
        /시점|언제|바로/.test(result.answer) &&
        /확인|물어/.test(result.answer),
    },
    {
      expected:
        "직전 제안의 대상을 유지해 현재 이직 의향·시점을 묻는 요청을 정확히 접수하고 전달 상태를 구분",
      history: [
        {
          message: `${recommendations[0].candidate.name} 지금 진짜 이직할 생각 있는 거 맞아?`,
          speaker: "Daniel",
        },
        {
          message: `${recommendations[0].candidate.name}님의 현재 이직 의향은 확인된 정보만으로 단정하기 어렵습니다. 원하시면 지금 이동을 고려하는지와 예상 시점을 확인할 수 있어요. ${context.workspace.companyName}의 ${recommendations[0].role.name} 포지션 검토와 관련된 질문임을 밝히고, 최소 20분 뒤 KST 08:00–20:00 사이에 이메일과 Harper 채팅으로 한 번 전달합니다. 답변은 선택이며 자동으로 재촉하지 않고, 답이 오면 이 대화로 알려드려요. 발송 전에는 취소할 수 있습니다. 이 내용으로 확인 요청할까요?`,
          speaker: "Harper",
        },
      ],
      id: "D22",
      message: "응, 지금 이직 생각이 있는지 물어봐줘.",
      mockTerminalWrites: true,
      pass: (result: EvalResult) =>
        result.calls.filter(
          (call) =>
            call.name === "contact_talent" &&
            call.arguments.kind === "question" &&
            call.arguments.talentId === recommendations[0].candidate.talentId
        ).length === 1 &&
        /접수/.test(result.answer) &&
        /아직.*완료|완료.*아니|완료.*아닌|완료.*아닙/.test(result.answer) &&
        /이메일/.test(result.answer) &&
        /Harper 채팅/.test(result.answer),
    },
    {
      expected:
        "저장된 보상을 공개하지 않고 후보자가 현재 값과 공유 표현을 정하도록 확인 절차를 제안",
      id: "D23",
      message: `${recommendations[0].candidate.name} 현재 연봉이랑 희망 연봉 얼마야?`,
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "contact_talent") &&
        !/\d\s*(?:억|천|백|만)\s*원/.test(result.answer) &&
        /후보자.*확인|후보자.*정|공유.*의사/.test(result.answer) &&
        /숫자|범위|총보상|표현/.test(result.answer) &&
        /기본급|통화|정확한 금액|전체 보상|total/i.test(result.answer),
    },
    {
      expected:
        "희망 보상과 허용 표현을 묻는 요청을 과거 금액 없이 접수하고 전달·답변 상태를 설명",
      history: [
        {
          message: `${recommendations[0].candidate.name} 현재 연봉이랑 희망 연봉 얼마야?`,
          speaker: "Daniel",
        },
        {
          message: `저장된 보상은 공유하지 않습니다. 원하시면 ${recommendations[0].candidate.name}님께 현재 희망 보상과 회사에 공유해도 되는 표현을 확인할 수 있어요. ${context.workspace.companyName}의 ${recommendations[0].role.name} 포지션 검토와 관련된 질문임을 밝히고, 최소 20분 뒤 KST 08:00–20:00 사이에 이메일과 Harper 채팅으로 한 번 전달합니다. 답변은 선택이며 자동으로 재촉하지 않고, 답이 오면 이 대화로 알려드려요. 발송 전에는 취소할 수 있습니다. 이 내용으로 진행할까요?`,
          speaker: "Harper",
        },
      ],
      id: "D24",
      message: "그럼 희망 보상을 어떻게 공유해도 되는지 물어봐줘.",
      mockTerminalWrites: true,
      pass: (result: EvalResult) => {
        const contact = result.calls.find(
          (call) => call.name === "contact_talent"
        );
        return Boolean(
          contact &&
          contact.arguments.kind === "question" &&
          /보상|연봉/.test(text(contact.arguments.requestContext)) &&
          !/\d\s*(?:억|천|백|만)\s*원/.test(
            text(contact.arguments.requestContext)
          ) &&
          /접수/.test(result.answer) &&
          /이메일/.test(result.answer)
        );
      },
    },
    {
      expected:
        "현재 프로필과 이력서 공개 상태를 먼저 확인하고 같은 턴에 후보자 요청을 보내지 않으며 다음 절차를 안내",
      id: "D25",
      message: `${recommendations[0].candidate.name} 이력서 있어? 없으면 바로 요청해줘.`,
      pass: (result: EvalResult) =>
        result.calls.some((call) =>
          readTalentCallIncludes(call, recommendations[0].candidate.talentId)
        ) &&
        !result.calls.some((call) => call.name === "contact_talent") &&
        /이력서.*없|확인.*이력서|프로필/.test(result.answer) &&
        /다음|요청.*원|요청하시면|요청할까요|말씀/.test(result.answer) &&
        /아직.*요청|요청.*않|보내지.*않/.test(result.answer),
    },
    {
      expected:
        "직전 확인의 대상을 유지해 최신 이력서 요청을 접수하고 전달 예정·선택적 응답을 설명",
      history: [
        {
          message: `${recommendations[0].candidate.name} 이력서 있어?`,
          speaker: "Daniel",
        },
        {
          message: `현재 회사가 볼 수 있는 이력서 파일은 없습니다. 원하시면 ${recommendations[0].candidate.name}님께 ${context.workspace.companyName}의 ${recommendations[0].role.name} 검토를 위한 최신 이력서 공유가 가능한지, 최소 20분 뒤 KST 08:00–20:00 사이에 이메일과 Harper 채팅으로 한 번 요청할 수 있어요. 공유 여부는 후보자의 선택이고 자동으로 재촉하지 않으며, 업로드되면 이 대화로 알려드립니다. 발송 전에는 취소할 수 있습니다. 이 내용으로 요청할까요?`,
          speaker: "Harper",
        },
      ],
      id: "D26",
      message: "응, 최신 이력서 요청해줘.",
      mockTerminalWrites: true,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "contact_talent" &&
            call.arguments.kind === "resume" &&
            call.arguments.talentId === recommendations[0].candidate.talentId
        ) &&
        /접수/.test(result.answer) &&
        /아직.*전달|전달.*아니|아직.*업로드|업로드.*아니/.test(result.answer) &&
        /선택|재촉/.test(result.answer),
    },
    {
      expected:
        "요청 이력을 읽어 전달 준비 중임을 설명하고 접수·전달 완료·답변 수신을 구분",
      history: [
        {
          message: `${recommendations[0].candidate.name}님께 확인 요청을 접수했습니다. 이메일과 Harper 채팅으로 전달할 예정입니다.`,
          speaker: "Harper",
        },
      ],
      id: "D27",
      message: "아까 물어본 거 실제로 전달됐어?",
      pass: (result: EvalResult) =>
        result.calls.some((call) =>
          readTalentCallIncludes(call, recommendations[0].candidate.talentId)
        ) &&
        /준비 중|준비.*단계|아직.*전달/.test(result.answer) &&
        !/전달 완료됐습니다|확실히 전달/.test(result.answer) &&
        /다음|이후|원하면|선택|답변|재촉/.test(result.answer),
    },
    {
      expected:
        "방식이 정해지지 않은 연결 요청의 의미를 이해하고 소개 메일과 직접 연락의 차이 및 이유의 용도를 자연스럽게 설명",
      id: "D28",
      message: `${recommendations[0].candidate.name} 만나보고 싶어. 연결해줘.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "prepare_candidate_connection" &&
            call.arguments.talentId === recommendations[0].candidate.talentId
        ) &&
        !result.calls.some(
          (call) => call.name === "decide_candidate_connection"
        ) &&
        /소개 메일/.test(result.answer) &&
        /직접 연락/.test(result.answer) &&
        /이유/.test(result.answer),
    },
    {
      expected:
        "직전 연결 확인을 이어받아 소개 메일·참조 이메일 방식으로 실제 결정을 실행하고 완료 결과를 정확히 설명",
      history: [
        {
          message: `${recommendations[0].candidate.name} 만나보고 싶어. 연결해줘.`,
          speaker: "Daniel",
        },
        {
          message: `${recommendations[0].candidate.name}님과 연결하기 전에 방식을 선택해 주세요. 소개 메일은 Harper가 후보자에게 메일을 보내고 회사 담당자를 참조하며, 직접 연락은 상태만 연결됨으로 변경하고 회사가 직접 연락하는 방식입니다. 결정 이유는 선택사항입니다.`,
          speaker: "Harper",
        },
      ],
      id: "D29",
      message: "소개 메일로 진행해줘. 담당자는 hiring@example.com을 참조해줘.",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "decide_candidate_connection" &&
            call.arguments.talentId === recommendations[0].candidate.talentId &&
            call.arguments.connectionMethod === "intro_email"
        ) &&
        /소개 메일|메일/.test(result.answer) &&
        /연결/.test(result.answer) &&
        /hiring@example.com|담당자/.test(result.answer) &&
        /이제|다음|스레드|일정|대화/.test(result.answer),
    },
    {
      expected:
        "대상을 임의 선택하거나 연락하지 않고 후보자 이름과 포지션을 묻는 한 가지 명확한 확인 질문",
      id: "D30",
      message: "그 후보자한테 지금 이직 생각 있는지 물어봐줘.",
      pass: (result: EvalResult) =>
        !result.calls.some((call) => call.name === "contact_talent") &&
        /어느 후보자|어떤 후보자|후보자.*이름|누구/.test(result.answer) &&
        /포지션|역할|Forward Deployed Engineer|Product Designer/.test(
          result.answer
        ),
    },
  ];

  console.log(
    JSON.stringify({
      candidate: recent.candidate.name,
      model: evalModel,
      roleCount: context.roles.length,
      targetRole: targetRole.name,
      workspace: context.workspace.companyName,
    })
  );

  const results: Array<Record<string, unknown>> = [];
  const internalIdPattern =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const unexpectedScriptPattern = /[\u0400-\u04ff\u0600-\u06ff\u0a80-\u0aff]/;
  const availableCases = arguments_.includes("--answer-set")
    ? answerSetCases
    : cases;
  const selectedCases =
    selectedCaseIds.size > 0
      ? availableCases.filter((testCase) => selectedCaseIds.has(testCase.id))
      : availableCases;
  if (selectedCases.length === 0) {
    throw new Error(
      `No eval cases matched: ${Array.from(selectedCaseIds).join(", ")}`
    );
  }
  for (const testCase of selectedCases) {
    console.error(`[live-eval] ${testCase.id} running`);
    const result = await runCase(testCase.message, {
      history: "history" in testCase ? testCase.history : undefined,
      mockTerminalWrites:
        "mockTerminalWrites" in testCase
          ? testCase.mockTerminalWrites
          : undefined,
    });
    const passed =
      testCase.pass(result) &&
      !internalIdPattern.test(
        result.answer.replace(
          /\(talent:[0-9a-f-]{36}\)/gi,
          "(talent:candidate-link)"
        )
      ) &&
      !unexpectedScriptPattern.test(result.answer) &&
      /[가-힣]/.test(result.answer);
    results.push({
      answer: result.answer,
      calls: result.calls,
      expected: testCase.expected,
      id: testCase.id,
      message: testCase.message,
      model: result.model,
      passed,
      usage: result.usage,
    });
    console.error(`[live-eval] ${testCase.id} ${passed ? "PASS" : "FAIL"}`);
  }

  console.log(JSON.stringify({ results }, null, 2));
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
