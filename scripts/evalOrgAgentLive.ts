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
    include: ["pipeline"],
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
                      connectionMethod: input.connectionMethod ?? "intro_email",
                      decision: input.decision,
                      stage:
                        input.decision === "decline"
                          ? "process_stopped"
                          : "connected",
                      status: "updated",
                    }
                  : await executeOrgAgentTool({
                      actorId: fakeUser.id,
                      actorLabel: text(fakeUser.email) || "eval user",
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
          : matchingSingaporeRoles.some((name) => result.answer.includes(name)),
    },
    {
      expected: `최근 후보 3명: ${topThree
        .map((item: any) => item.candidate.name)
        .join(", ")}`,
      id: "Q2",
      message: "가장 최근 추천된 후보자 3명과 각 포지션, 현재 단계를 알려줘.",
      pass: (result: EvalResult) =>
        topThree.every((item) => result.answer.includes(item.candidate.name)),
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
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const unexpectedScriptPattern = /[\u0400-\u04ff\u0600-\u06ff\u0a80-\u0aff]/;
  const selectedCases =
    selectedCaseIds.size > 0
      ? cases.filter((testCase) => selectedCaseIds.has(testCase.id))
      : cases;
  if (selectedCases.length === 0) {
    throw new Error(
      `No eval cases matched: ${Array.from(selectedCaseIds).join(", ")}`
    );
  }
  for (const testCase of selectedCases) {
    console.error(`[live-eval] ${testCase.id} running`);
    const result = await runCase(testCase.message);
    const passed =
      testCase.pass(result) &&
      !internalIdPattern.test(result.answer) &&
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
