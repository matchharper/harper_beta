import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

type ToolCallRecord = {
  arguments: Record<string, unknown>;
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

async function main() {
  const workspaceId = text(
    process.argv.slice(2).find((argument) => argument !== "--")
  );
  if (!workspaceId) {
    throw new Error(
      "Usage: pnpm org-agent:live-eval -- <company-workspace-id>"
    );
  }

  const [
    { buildOrgAgentPromptContext },
    { fetchRecentOrgAgentRecommendations, readOrgAgentRole },
    { createChatCompletionWithFallback },
    { DEFAULT_ORG_AGENT_MODEL, getOrgAgentFallbackModel, ORG_AGENT_GROK_MODEL },
    { buildOrgAgentSystemPrompt, buildOrgAgentUserPrompt },
    { serializeOrgAgentToolError, serializeOrgAgentToolResult },
    { getSupabaseAdmin },
    {
      createOrgAgentToolExecutionState,
      executeOrgAgentTool,
      promoteOrgAgentToolReadVisibility,
    },
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
    import("../src/lib/org/agent/tools"),
  ]);

  const admin = getSupabaseAdmin();
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
  const [context, recommendations] = await Promise.all([
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
    (role) => role.roleId === recent.role.roleId
  );
  if (!targetRole) throw new Error("Recent recommendation role was not found");
  const targetRoleDetails = await readOrgAgentRole({
    admin,
    includeDescription: false,
    peopleLimit: 10,
    recentUpdateLimit: 10,
    roleId: targetRole.roleId,
    user: fakeUser,
    workspaceId,
  });
  const workModeRole =
    context.roles.find(
      (role) =>
        role.workMode !== "remote" &&
        context.roles.filter((other) => other.name === role.name).length === 1
    ) ?? targetRole;
  const matchingSingaporeRoles = context.roles
    .filter(
      (role) =>
        role.status === "active" &&
        role.workMode === "remote" &&
        text(role.locationText).toLocaleLowerCase().includes("singapore")
    )
    .map((role) => role.name);
  const topThree = recommendations.slice(0, 3);
  async function runCase(message: string): Promise<EvalResult> {
    const state = createOrgAgentToolExecutionState(context);
    const messages: any[] = [
      { content: buildOrgAgentSystemPrompt(), role: "system" },
      {
        content: buildOrgAgentUserPrompt({
          context,
          mentions: [],
          userLabel: "Workspace recruiter",
          userMessage: message,
        }),
        role: "user",
      },
    ];
    const calls: ToolCallRecord[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let activeModel = DEFAULT_ORG_AGENT_MODEL;

    for (let loop = 0; loop < 5; loop += 1) {
      const completion = await createChatCompletionWithFallback({
        anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
        buildRequest: () => ({
          max_tokens: 2_000,
          messages,
          temperature: 0.1,
          tool_choice: "auto",
          tools: ORG_AGENT_TOOLS,
        }),
        debugLabel: `org/agent:live-eval:${loop}`,
        fallbackModel: getOrgAgentFallbackModel(activeModel),
        model: activeModel,
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
        content: text(responseMessage.content) || null,
        role: "assistant",
        ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
      });
      if (toolCalls.length === 0) {
        return {
          answer: text(responseMessage.content),
          calls,
          model: activeModel,
          usage,
        };
      }

      for (const call of toolCalls) {
        const name = text(call?.function?.name);
        const callId = text(call?.id) || randomUUID();
        const input = parseArguments(call?.function?.arguments);
        calls.push({ arguments: input, name });

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
            name === "update_company"
              ? {
                  changeSummary: input.changeSummary,
                  company: { companyName: context.workspace.companyName },
                  status: "updated",
                }
              : name === "update_role"
                ? {
                    changeSummary: input.changeSummary,
                    role: {
                      name: state.roleById.get(text(input.roleId))?.name,
                      roleId: input.roleId,
                    },
                    status: "updated",
                  }
                : name === "prepare_candidate_connection"
                  ? {
                      candidateEmail: null,
                      candidateName: "Candidate",
                      nextStep:
                        "Explain the email recipients and connection choices, then ask for confirmation without changing the candidate yet.",
                      requesterEmail: fakeUser.email ?? null,
                      status: "ready_for_confirmation",
                    }
                  : name === "decide_candidate_connection"
                    ? {
                        changeSummary: "후보자 연결 결정을 반영했습니다.",
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
                        admin,
                        callId,
                        conversation,
                        currentUserMessageId: 1,
                        input,
                        name,
                        slackThreadId: null,
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
          : "해당 포지션이 없다고 답변",
      id: "Q1",
      message: "Singapore에서 remote로 열려 있는 포지션이 뭐야?",
      pass: (result: EvalResult) =>
        matchingSingaporeRoles.length === 0
          ? /없|찾지/.test(result.answer)
          : matchingSingaporeRoles.some((name) => result.answer.includes(name)),
    },
    {
      expected: `최근 후보 3명: ${topThree
        .map((item) => item.candidate.name)
        .join(", ")}`,
      id: "Q2",
      message: "가장 최근 추천된 후보자 3명과 각 포지션, 현재 단계를 알려줘.",
      pass: (result: EvalResult) =>
        topThree.every((item) => result.answer.includes(item.candidate.name)),
    },
    {
      expected: `read_role(${targetRole.roleId}, stage 생략) 후 단계별 집계 ${targetRoleDetails.stageCounts
        .map((item) => `${item.stage}=${item.count}`)
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
        targetRoleDetails.stageCounts.every((item) =>
          result.answer.includes(String(item.count))
        ),
    },
    {
      expected: `read_talent(${recent.candidate.talentId}, includeProfile=false)`,
      id: "Q4",
      message: `${recent.candidate.name} 후보자의 현재 진행 상태와 최근 업데이트를 알려줘.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "read_talent" &&
            call.arguments.talentId === recent.candidate.talentId &&
            call.arguments.includeProfile !== true
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
            call.name === "read_talent" &&
            call.arguments.talentId === recent.candidate.talentId &&
            call.arguments.includeProfile === true
        ) &&
        result.calls.some(
          (call) =>
            call.name === "read_role" &&
            call.arguments.roleId === targetRole.roleId
        ),
    },
    {
      expected: "update_company의 pitch만 지정한 문구로 변경",
      id: "A1",
      message:
        "회사 후보자 pitch를 '복잡한 운영 업무를 자율적으로 해결하는 AI workforce를 함께 만듭니다.'로 바꿔줘.",
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "update_company" &&
            call.arguments.pitch ===
              "복잡한 운영 업무를 자율적으로 해결하는 AI workforce를 함께 만듭니다." &&
            !Object.hasOwn(call.arguments, "request") &&
            !Object.hasOwn(call.arguments, "companyDescription")
        ),
    },
    {
      expected: `update_role(${workModeRole.roleId}, workMode=remote)`,
      id: "A2",
      message: `${workModeRole.name} 포지션의 근무 방식을 remote로 바꿔줘.`,
      pass: (result: EvalResult) =>
        result.calls.some(
          (call) =>
            call.name === "update_role" &&
            call.arguments.roleId === workModeRole.roleId &&
            call.arguments.workMode === "remote"
        ),
    },
    {
      expected: `update_role(${targetRole.roleId}) request에 B2B 고객 배포 경험을 필수로 추가`,
      id: "A3",
      message: `${targetRole.name} 채용 기준에 B2B 고객 대상 프로덕션 배포 경험을 필수 조건으로 추가해줘.`,
      pass: (result: EvalResult) => {
        const call = result.calls.find(
          (item) =>
            item.name === "update_role" &&
            item.arguments.roleId === targetRole.roleId
        );
        return Boolean(
          call &&
          typeof call.arguments.request === "string" &&
          includesAll(call.arguments.request, ["B2B", "필수"])
        );
      },
    },
  ];

  console.log(
    JSON.stringify({
      candidate: recent.candidate.name,
      model: DEFAULT_ORG_AGENT_MODEL,
      roleCount: context.roles.length,
      targetRole: targetRole.name,
      workspace: context.workspace.companyName,
    })
  );

  const results: Array<Record<string, unknown>> = [];
  const internalIdPattern =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
  for (const testCase of cases) {
    console.error(`[live-eval] ${testCase.id} running`);
    const result = await runCase(testCase.message);
    const passed =
      testCase.pass(result) &&
      !internalIdPattern.test(result.answer) &&
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
