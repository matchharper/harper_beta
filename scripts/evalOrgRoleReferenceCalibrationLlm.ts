import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

type ToolCall = {
  function: { arguments: string; name: string };
  id: string;
  type: "function";
};

type EvalMessage = {
  content: string;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: ToolCall[];
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
        id: text(item.id) || `reference_eval_tool_${index}`,
        type: "function" as const,
      },
    ];
  });
}

const profiles: Record<string, string> = {
  "https://www.linkedin.com/in/caliber-anchor-a": `# Alex Anchor

Education: Stanford University, B.S. Computer Science.

Experience:
- OpenAI, Member of Technical Staff. Promoted twice while owning a core inference reliability area used across multiple product lines.
- Stripe, Software Engineer on the core payments platform. Led a multi-team migration with measurable global reliability gains.

Evidence: repeated selection into core technical teams, fast progression, organization-wide ownership, and durable production outcomes.`,
  "https://www.linkedin.com/in/caliber-anchor-b": `# Blair Anchor

Education: Massachusetts Institute of Technology, B.S. Electrical Engineering and Computer Science.

Experience:
- Meta, Staff Software Engineer in ranking infrastructure. Technical lead for a system serving billions of daily requests.
- Palantir, Software Engineer. Owned a high-stakes deployment for a major enterprise customer and expanded the solution across the account.

Evidence: highly selective environments, staff-level progression, unusually large scope, and trusted ownership of difficult systems.`,
  "https://www.linkedin.com/in/caliber-anchor-c": `# Casey Anchor

Education: Regional public university, B.S. Information Systems.

Experience:
- Founded a vertical SaaS company and grew it from zero to $18M ARR with a 45-person team before acquisition.
- Personally designed the first product and later recruited leaders for engineering, sales, and customer success.

Evidence: no conventional elite-school or elite-employer signal, but exceptional founder outcomes, steep responsibility growth, and independently verified business impact.`,
  "https://www.linkedin.com/in/caliber-anchor-d": `# Devon Anchor

Education: University of Oxford, M.S. Computer Science with distinction.

Experience:
- Google DeepMind, Senior Research Engineer on a core model-evaluation team. Promoted after leading evaluation infrastructure used by several research groups.
- Jane Street, Software Engineer in a highly selective quantitative engineering group.

Evidence: repeated selection by top-tier academic and employer environments, core-team placement, fast progression, and trusted technical responsibility.`,
};

async function main() {
  const [llm, modelConfig, prompt] = await Promise.all([
    import("../src/lib/llm/llm"),
    import("../src/lib/org/agent/modelConfig"),
    import("../src/lib/org/agent/roleCreationPrompt"),
  ]);
  const model = modelConfig.ORG_AGENT_LUNA_MODEL;
  const evalTools = [
    {
      type: "function" as const,
      function: {
        name: "open_url",
        description:
          "Open a specific website URL and return page markdown. Use when the user provides a URL or asks to read, inspect, summarize, or reason about a specific webpage.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The exact http(s) URL to open.",
            },
          },
          required: ["url"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_role_draft",
        description:
          "Save supported Role facts and the complete private Hiring Brief while preserving still-valid existing content.",
        parameters: {
          type: "object",
          minProperties: 1,
          properties: {
            request: {
              type: ["string", "null"],
              description:
                "The complete private Hiring Brief in Markdown. Preserve existing content and keep role eligibility / experience fit, company talent quality / caliber, and team-specific bonus preferences in clearly separate sections. Caliber is the company's comparative overall talent-level gate, not another summary of job experience: a candidate may match the stack, domain, Agent, customer, or 0-to-1 requirements and still fall below it. For opened reference or current-team-member LinkedIn profiles, keep exact source URLs and distinguish user-stated reasons, observed professional facts, and Harper's tentative interpretation. Preserve every supported caliber signal explicitly, including repeated selection by Top-tier schools or programs, Top-tier companies, or highly selective core teams; actual program, team, and role selectivity; trajectory; rare achievement; and exceptional alternative outcomes. Do not automatically rewrite those patterns as generic ownership or impact, and do not treat prestigious affiliation alone as proof. Treat one profile as a tentative anchor; compare multiple profiles to find the smallest stable company-specific caliber rules, below-bar boundary, equivalents, tradeoffs, and uncertainty. User-stated judgment takes precedence. Do not use protected traits or non-job-related similarity.",
            },
            criteria: {
              type: "array",
              minItems: 0,
              maxItems: 6,
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  criteria: { type: "string" },
                },
                required: ["name", "criteria"],
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "read_other_roles",
        description:
          "Read other internal roles in the same company before drafting private matching judgment.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
  ];
  const now = new Date().toISOString();
  const role = {
    criteria: [
      {
        name: "역할 수행 역량",
        criteria:
          "분산 시스템을 설계하고 운영한 근거를 확인하되, 특정 기술 이름만으로 판단하지 않는다.",
      },
    ],
    createdAt: now,
    description:
      "Apex AI는 복잡한 업무를 자동화하는 엔터프라이즈 AI 제품을 만듭니다. 이 역할은 핵심 플랫폼을 설계하고 제품팀과 협업합니다.",
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    hasMemory: false,
    locationText: "서울 또는 샌프란시스코",
    memory: null,
    name: "Senior Product Engineer",
    request:
      "## 기본 자격\n분산 시스템 설계와 제품 엔지니어링 경험.\n\n## 역할 선호\n고객과 협업하고 모호한 문제를 구조화할 수 있는 사람." as
        | string
        | null,
    roleId: "22222222-2222-4222-8222-222222222222",
    salaryRange: null,
    status: "draft",
    updatedAt: now,
    workMode: "hybrid",
    workspaceId: "11111111-1111-4111-8111-111111111111",
  };
  const state = {
    assigneeUserIds: [],
    channels: [
      {
        channelId: "44444444-4444-4444-8444-444444444444",
        channelName: "hiring",
        enabled: true,
      },
    ],
    conversation: {
      company_workspace_id: role.workspaceId,
      created_at: now,
      id: "55555555-5555-4555-8555-555555555555",
      last_message_at: null,
      last_message_id: null,
      metadata: { phase: "collecting", scope: "role_creation" },
      role_id: role.roleId,
      summary_cursor_message_id: null,
      title: null,
      updated_at: now,
    },
    currentUser: {
      email: "hiring@example.com",
      name: "채용 리드",
      userId: "33333333-3333-4333-8333-333333333333",
    },
    members: [],
    metadata: {
      confirmedSlackChannelIds: [],
      phase: "collecting" as const,
      scope: "role_creation" as const,
    },
    role,
    workspace: {
      companyName: "Apex AI",
      homepageUrl: "https://example.com",
      linkedinUrl: null,
      pitch:
        "Apex AI는 매우 높은 인재 밀도를 유지하며 소수 정예 팀으로 엔터프라이즈 AI 제품을 만듭니다.",
      relatedLinks: [],
      request: null,
      workspaceId: role.workspaceId,
    },
  } as any;
  const scenario = process.env.REFERENCE_EVAL_SCENARIO ?? "mixed_paths";
  const profileUrls =
    scenario === "ask_for_refs"
      ? []
      : scenario === "all_top_tier"
        ? [
            "https://www.linkedin.com/in/caliber-anchor-a",
            "https://www.linkedin.com/in/caliber-anchor-b",
            "https://www.linkedin.com/in/caliber-anchor-d",
          ]
        : [
            "https://www.linkedin.com/in/caliber-anchor-a",
            "https://www.linkedin.com/in/caliber-anchor-b",
            "https://www.linkedin.com/in/caliber-anchor-c",
          ];
  const userMessage =
    scenario === "ask_for_refs"
      ? "지금 저장된 기본 자격과 역할 선호를 바탕으로 다음 단계로 진행해 주세요. 아직 참고할 사람이나 회사의 인재 수준 기준은 따로 말씀드리지 않았어요."
      : [
          "아래 세 명을 이 역할의 참고 프로필로 봐 주세요.",
          scenario === "all_top_tier"
            ? "세 명 모두 현재 팀에서 대표적으로 이상적이라고 보는 구성원입니다. 아직 어떤 대체 경로를 동급으로 볼지는 정하지 않았습니다."
            : "두 명은 현재 팀에서 대표적으로 이상적이라고 보는 구성원이고, 세 번째는 다른 경로로도 같은 급을 보여줄 수 있는 예시입니다.",
          "중요한 건 Agent 경험, 특정 기술, 0-to-1 경험 같은 role fit이 아니라 이 회사가 만족할 전체적인 talent quality와 caliber예요.",
          "프로필을 모두 열어보고 기존 Hiring Brief의 기본 자격은 보존하면서 회사가 실제 인터뷰하고 싶어 할 quality bar를 별도 기준으로 작성해 주세요.",
          ...profileUrls,
        ].join("\n");
  const messages: EvalMessage[] = [
    {
      content: prompt.buildRoleCreationSystemPrompt({ surface: "chat" }),
      role: "system",
    },
    {
      content: prompt.buildRoleCreationUserPrompt({
        attachments: [],
        history: [],
        mentions: [],
        state,
        userMessage,
      }),
      role: "user",
    },
  ];
  const toolCalls: Array<{ input: Record<string, unknown>; name: string }> = [];
  let finalReply = "";

  for (let loop = 0; loop < 6; loop += 1) {
    const completion = await llm.createChatCompletionWithFallback({
      buildRequest: (activeModel) => ({
        ...(llm.usesMaxCompletionTokensForModel(activeModel)
          ? { max_completion_tokens: 4_800 }
          : { max_tokens: 4_800 }),
        messages,
        temperature: 0.15,
        tool_choice: "auto" as const,
        tools: evalTools,
      }),
      debugLabel: "org/agent:reference-calibration-llm-eval",
      model,
      openAIResponses: { reasoningEffort: "high" },
    });
    if (completion.model !== model) {
      throw new Error(`Expected ${model}, received ${completion.model}`);
    }
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
      toolCalls.push({ input, name: call.function.name });
      let result: Record<string, unknown>;
      if (call.function.name === "open_url") {
        const url = text(input.url);
        const markdown = profiles[url];
        result = markdown
          ? { markdown, ok: true, title: markdown.split("\n")[0], url }
          : { error: "profile_not_found", ok: false, url };
      } else if (call.function.name === "update_role_draft") {
        if (Object.hasOwn(input, "request")) {
          role.request = text(input.request) || null;
        }
        if (Object.hasOwn(input, "criteria") && Array.isArray(input.criteria)) {
          role.criteria = input.criteria as typeof role.criteria;
        }
        result = {
          ok: true,
          role: { criteria: role.criteria, request: role.request },
        };
      } else if (call.function.name === "read_other_roles") {
        result = { companyName: "Apex AI", roles: [] };
      } else {
        result = {
          error: `unsupported_eval_tool:${call.function.name}`,
          ok: false,
        };
      }
      messages.push({
        content: JSON.stringify(result),
        role: "tool",
        tool_call_id: call.id,
      });
    }
  }

  console.log(`SCENARIO\n${scenario}`);
  console.log(`\nMODEL\n${model}`);
  console.log(`\nTOOLS\n${JSON.stringify(toolCalls, null, 2)}`);
  console.log(`\nSAVED REQUEST\n${role.request ?? ""}`);
  console.log(`\nHARPER\n${finalReply}`);

  if (!finalReply) throw new Error("Luna returned no final reply");
  if (!toolCalls.some((call) => call.name === "update_role_draft")) {
    throw new Error("Luna did not update the Hiring Brief");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
