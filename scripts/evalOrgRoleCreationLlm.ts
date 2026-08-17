import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

type EvalMessage = {
  content: string;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type ToolCall = {
  function: { arguments: string; name: string };
  id: string;
  type: "function";
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseToolCalls(message: Record<string, unknown>): ToolCall[] {
  if (!Array.isArray(message.tool_calls)) return [];
  return message.tool_calls.flatMap((raw, index) => {
    const item = record(raw);
    const fn = record(item.function);
    const name = text(fn.name);
    if (!name) return [];
    return [
      {
        function: {
          arguments:
            typeof fn.arguments === "string"
              ? fn.arguments
              : JSON.stringify(fn.arguments ?? {}),
          name,
        },
        id: text(item.id) || `eval_tool_${index}`,
        type: "function" as const,
      },
    ];
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`LLM eval assertion failed: ${message}`);
}

async function main() {
  const [
    llm,
    modelConfig,
    prompt,
    roleState,
    roleTools,
    { validateRoleCreationNotificationConsent },
  ] = await Promise.all([
    import("../src/lib/llm/llm"),
    import("../src/lib/org/agent/modelConfig"),
    import("../src/lib/org/agent/roleCreationPrompt"),
    import("../src/lib/org/agent/roleCreationState"),
    import("../src/lib/org/agent/roleCreationTools"),
    import("../src/lib/org/agent/roleCreationConsent"),
  ]);
  const selectedModel = modelConfig.resolveOrgAgentModel(
    modelConfig.DEFAULT_ORG_AGENT_MODEL
  ).model;
  const currentYear = new Date().toISOString();
  const roleId = "22222222-2222-4222-8222-222222222222";
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const userId = "33333333-3333-4333-8333-333333333333";
  const channelId = "44444444-4444-4444-8444-444444444444";
  const roleTitle = "Backend Platform Engineer";
  const state: Parameters<
    typeof prompt.buildRoleCreationUserPrompt
  >[0]["state"] = {
    assigneeUserIds: [],
    channels: [
      {
        channelId,
        channelName: "hiring-platform",
        enabled: true,
      },
    ],
    conversation: {
      company_workspace_id: workspaceId,
      created_at: currentYear,
      id: "55555555-5555-4555-8555-555555555555",
      last_message_at: null,
      last_message_id: null,
      metadata: { phase: "collecting", scope: "role_creation" },
      role_id: roleId,
      summary_cursor_message_id: null,
      title: null,
      updated_at: currentYear,
    },
    currentUser: {
      email: "smoke@example.com",
      name: "김테스트",
      userId,
    },
    members: [
      {
        email: "smoke@example.com",
        name: "김테스트",
        userId,
      },
    ],
    metadata: {
      completedAt: null,
      completedBy: null,
      confirmationProcessingActionId: null,
      confirmationProcessingDecision: null,
      confirmationProcessingMessageId: null,
      confirmationProcessingStartedAt: null,
      confirmedAssigneeUserId: null,
      confirmedSlackChannelIds: [],
      lastConfirmationActionId: null,
      lastConfirmationDecision: null,
      lastConfirmationHandledAt: null,
      lastConfirmationMessageId: null,
      pendingConfirmationMessageId: null,
      phase: "collecting" as const,
      scope: "role_creation" as const,
      slackRoleCreationThread: null,
    },
    role: {
      criteria: [],
      createdAt: currentYear,
      description: null,
      employmentTypes: [],
      externalJdUrl: null,
      hasMemory: false,
      locationText: null,
      memory: null,
      name: "새 역할",
      request: null,
      roleId,
      salaryRange: null,
      status: "draft",
      updatedAt: currentYear,
      workMode: null,
      workspaceId,
    },
    workspace: {
      brief: "초기 B2B SaaS 팀",
      careerUrl: null,
      companyDbId: null,
      companyDescription:
        "기업 고객의 반복적인 데이터 운영을 자동화하는 B2B SaaS 회사",
      companyName: "테스트랩",
      homepageUrl: null,
      linkedinUrl: null,
      logoUrl: null,
      pitch: "복잡한 기업 데이터 운영을 단순하게 만듭니다.",
      relatedLinks: [],
      request: null,
      updatedAt: currentYear,
      workspaceId,
    },
  };
  const history: Array<{
    attachments?: [];
    content: string;
    role: string;
  }> = [];
  const allToolCalls: Array<{
    input: Record<string, unknown>;
    name: string;
    turn: number;
  }> = [];
  let confirmationRequested = false;
  let previousAssistantMessage = "";

  const applyTool = (
    name: string,
    input: Record<string, unknown>,
    userMessage: string
  ) => {
    assert(roleTools.isRoleCreationToolName(name), `unknown tool ${name}`);
    if (name === "update_role_draft") {
      if (Object.hasOwn(input, "name")) state.role.name = text(input.name);
      if (Object.hasOwn(input, "description")) {
        state.role.description = text(input.description) || null;
      }
      if (Object.hasOwn(input, "request")) {
        state.role.request = text(input.request) || null;
      }
      if (Object.hasOwn(input, "locationText")) {
        state.role.locationText = text(input.locationText) || null;
      }
      if (Object.hasOwn(input, "workMode")) {
        state.role.workMode = text(input.workMode) || null;
      }
      if (Object.hasOwn(input, "employmentTypes")) {
        state.role.employmentTypes = Array.isArray(input.employmentTypes)
          ? input.employmentTypes.map(text).filter(Boolean)
          : [];
      }
      return {
        missingFields: roleState.getRoleCreationMissingFields(state),
        ok: true,
      };
    }
    if (name === "set_role_notification") {
      const selectedChannelIds = Array.isArray(input.channelIds)
        ? input.channelIds.map(text).filter(Boolean)
        : [];
      const assigneeUserId = text(input.assigneeUserId);
      const targets = [
        ...state.channels
          .filter((channel) => selectedChannelIds.includes(channel.channelId))
          .map((channel) => ({
            aliases: [
              `#${channel.channelName ?? channel.channelId}`,
              channel.channelId,
            ],
            id: `channel:${channel.channelId}`,
            label: channel.channelName ?? channel.channelId,
          })),
        ...(assigneeUserId === userId
          ? [
              {
                aliases: ["smoke@example.com", userId, "저로", "제가"],
                id: `assignee:${userId}`,
                label: "김테스트",
              },
            ]
          : []),
      ];
      const consent = validateRoleCreationNotificationConsent({
        previousAssistantMessage,
        targets,
        userMessage,
      });
      assert(
        consent.ok,
        `notification consent rejected: ${consent.missingTargetIds.join(",")}`
      );
      if (selectedChannelIds.length > 0) {
        state.metadata.confirmedSlackChannelIds = selectedChannelIds;
      }
      if (assigneeUserId) {
        state.assigneeUserIds = [assigneeUserId];
        state.metadata.confirmedAssigneeUserId = assigneeUserId;
      }
      return {
        missingFields: roleState.getRoleCreationMissingFields(state),
        ok: true,
      };
    }
    if (name === "read_other_roles") {
      return {
        companyName: state.workspace.companyName,
        roles: [
          {
            description: "고객 문제를 제품 기능으로 바꾸는 초기 팀 엔지니어",
            memory: "모호한 문제를 구조화하고 끝까지 배포한 경험을 우선",
            name: "Product Engineer",
            request: "초기 제품 ownership은 필수, B2B 경험은 가산점",
            roleId: "66666666-6666-4666-8666-666666666666",
          },
        ],
      };
    }
    if (name === "request_role_creation_confirmation") {
      const missingFields = roleState.getRoleCreationMissingFields(state);
      confirmationRequested = missingFields.length === 0;
      return confirmationRequested
        ? { ok: true, presentationRequired: true }
        : { error: "role_creation_not_ready", missingFields, ok: false };
    }
    if (name === "update_company_context") {
      return { ok: true };
    }
    throw new Error(`Unexpected external tool in synthetic eval: ${name}`);
  };

  const turns = [
    [
      `새 역할을 등록하려고 해요. 역할명은 ${roleTitle}입니다.`,
      "B2B SaaS의 핵심 API와 데이터 파이프라인을 설계하고 제품팀과 고객 요구를 안정적인 플랫폼 기능으로 만드는 역할이에요.",
      "근무지는 서울 강남이고 주 2회 출근하는 하이브리드 정규직입니다.",
      "비공개 기준은 TypeScript와 Node.js 백엔드 실무, PostgreSQL 데이터 모델링과 분산 시스템 설계 경험이 필수이고 초기 스타트업에서 모호한 문제를 제품으로 풀어본 경험은 가산점입니다.",
    ].join(" "),
    "첫 6개월에는 주요 API 장애율과 배포 리드타임을 낮추고 반복되는 고객별 데이터 연동을 표준화하는 것이 핵심 성과예요. 지원자가 보는 설명에 반영해 주세요.",
    "#hiring-platform 채널을 Slack 알림 채널로 연결하고 김테스트님을 담당자로 등록해 주세요. 둘 다 이 값으로 명시적으로 동의합니다.",
    "지금까지 저장된 내용으로 역할 작성을 완료하는 확인 단계로 진행해 주세요.",
  ];

  for (const [turnIndex, userMessage] of turns.entries()) {
    const messages: EvalMessage[] = [
      { content: prompt.buildRoleCreationSystemPrompt(), role: "system" },
      {
        content: prompt.buildRoleCreationUserPrompt({
          attachments: [],
          history,
          mentions: [],
          state,
          userMessage,
        }),
        role: "user",
      },
    ];
    let finalReply = "";
    let awaitingConfirmationNarrative = false;
    const turnCalls: string[] = [];
    for (let loop = 0; loop < 5; loop += 1) {
      const completion = await llm.createChatCompletionWithFallback({
        anthropicOverloadFallbackModel: modelConfig.ORG_AGENT_GROK_MODEL,
        buildRequest: (model) => ({
          ...(llm.usesMaxCompletionTokensForModel(model)
            ? { max_completion_tokens: 4_800 }
            : { max_tokens: 4_800 }),
          messages,
          temperature: 0.15,
          ...(awaitingConfirmationNarrative
            ? {}
            : {
                tool_choice: "auto" as const,
                tools: roleTools.ROLE_CREATION_TOOLS,
              }),
        }),
        debugLabel: `org/agent:role-creation-llm-eval:${turnIndex + 1}`,
        deepSeekThinking: { reasoningEffort: "high" },
        fallbackModel: modelConfig.getOrgAgentFallbackModel(selectedModel),
        model: selectedModel,
        openAIResponses: { reasoningEffort: "high" },
      });
      const root = record(completion.response);
      const choices = Array.isArray(root.choices) ? root.choices : [];
      const responseMessage = record(record(choices[0]).message);
      const responseText = text(responseMessage.content);
      const calls = parseToolCalls(responseMessage);
      if (calls.length === 0) {
        finalReply = responseText;
        break;
      }
      messages.push({
        content: responseText,
        role: "assistant",
        tool_calls: calls,
      });
      for (const call of calls) {
        const input = record(JSON.parse(call.function.arguments || "{}"));
        turnCalls.push(call.function.name);
        allToolCalls.push({
          input,
          name: call.function.name,
          turn: turnIndex + 1,
        });
        const result = applyTool(call.function.name, input, userMessage);
        if (record(result).presentationRequired === true) {
          awaitingConfirmationNarrative = true;
        }
        messages.push({
          content: JSON.stringify(result),
          role: "tool",
          tool_call_id: call.id,
        });
      }
    }
    assert(finalReply, `turn ${turnIndex + 1} returned no final reply`);
    console.log(`\nTURN ${turnIndex + 1} USER\n${userMessage}`);
    console.log(`\nTURN ${turnIndex + 1} TOOLS\n${turnCalls.join(", ") || "-"}`);
    console.log(`\nTURN ${turnIndex + 1} HARPER\n${finalReply}`);
    history.push({ content: userMessage, role: "user" });
    history.push({ content: finalReply, role: "assistant" });
    previousAssistantMessage = finalReply;
  }

  const missingFields = roleState.getRoleCreationMissingFields(state);
  assert(state.role.name === roleTitle, "role title mismatch");
  assert(Boolean(state.role.description), "description was not saved");
  assert(Boolean(state.role.request), "private criteria were not saved");
  assert(
    state.role.criteria.length >= 3 && state.role.criteria.length <= 6,
    "structured criteria were not saved"
  );
  assert(state.role.locationText === "서울 강남", "location mismatch");
  assert(state.role.workMode === "hybrid", "work mode mismatch");
  assert(state.role.employmentTypes.includes("full_time"), "employment type missing");
  assert(missingFields.length === 0, `remaining fields: ${missingFields.join(",")}`);
  assert(confirmationRequested, "confirmation tool was not requested");
  assert(
    allToolCalls.some((call) => call.name === "update_role_draft"),
    "role update tool was never called"
  );
  assert(
    allToolCalls.some((call) => call.name === "set_role_notification"),
    "notification tool was never called"
  );

  console.log(
    `\nLLM EVAL RESULT\n${JSON.stringify(
      {
        confirmationRequested,
        missingFields,
        model: selectedModel,
        toolCalls: allToolCalls.map(({ name, turn }) => ({ name, turn })),
      },
      null,
      2
    )}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
