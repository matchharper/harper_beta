import {
  executeSharedOpenUrl,
  executeSharedWebSearch,
  OPEN_URL_TOOL_DEFINITION,
  WEB_SEARCH_TOOL_DEFINITION,
} from "@/lib/agentTools/web";
import {
  createChatCompletionWithFallback,
  usesMaxCompletionTokensForModel,
} from "@/lib/llm/llm";
import { GPT_56_LUNA_MODEL, GPT_56_TERRA_MODEL } from "@/lib/llm/modelConfig";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";
import {
  fetchAutoIntroToCompanyCandidateDossiers,
  fetchManualAutoIntroToCompanyCandidateDossier,
  sendCodexAuthoredAutoIntroToCompanyNotifications,
  sendManualAutoIntroToCompanyNotification,
  type AutoIntroToCompanyCandidateDossiers,
  type CodexAuthoredWorkspaceMessage,
} from "@/lib/ops/autoIntroToCompanyNotifications";
import type {
  AutoIntroLlmTraceEvent,
  AutoIntroManualTraceEvent,
} from "@/lib/ops/autoIntroToCompanyDebugTypes";
import {
  AUTO_INTRO_LLM_MAX_WEB_TOOL_CALLS,
  buildAutoIntroLlmInput,
  parseAutoIntroLlmSubmission,
} from "@/lib/ops/autoIntroToCompanyLlmPrompt";
import { verbalizeAutoIntroWebToolResult } from "@/lib/ops/autoIntroToCompanyPromptContext";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

const AUTO_INTRO_LLM_MAX_TOOL_LOOPS = 12;
const AUTO_INTRO_LLM_MAX_OUTPUT_TOKENS = 12_000;
const AUTO_INTRO_LLM_CONCURRENCY = 3;
const AUTO_INTRO_LLM_SOURCE = "vercel_cron_llm_auto_intro_to_company";
const MANUAL_AUTO_INTRO_LLM_SOURCE = "manual_llm_auto_intro_to_company";

type DossierGroup = AutoIntroToCompanyCandidateDossiers["groups"][number];
type LlmToolCall = {
  function: { arguments: string; name: string };
  id: string;
  type: "function";
};

type GenerateAutoIntroOptions = {
  logUsage?: boolean;
  onTrace?: (event: AutoIntroLlmTraceEvent) => Promise<void> | void;
  source?: string;
};

const SUBMIT_AUTO_INTRO_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_auto_intro",
    description:
      "Submit the complete, structured Slack candidate-introduction copy for this workspace. Call exactly once after any useful research is complete.",
    parameters: {
      type: "object",
      properties: {
        followUpQuestion: {
          type: ["string", "null"],
          description:
            "One concise question addressed to the hiring company about its role requirements or priorities, or null. Never ask the candidate about their preferences.",
        },
        roles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              candidates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    internalReason: { type: ["string", "null"] },
                    slackProfile: {
                      type: "object",
                      properties: {
                        currentRole: {
                          type: ["string", "null"],
                          description:
                            "The candidate's verified current title and employer, faithfully stated without upgrading or reclassifying the role, or null.",
                        },
                        education: { type: ["string", "null"] },
                        harperNote: { type: ["string", "null"] },
                        location: { type: ["string", "null"] },
                        preferences: {
                          type: "array",
                          items: { type: "string" },
                        },
                        tldr: { type: "string" },
                        workSummary: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              bullets: {
                                type: "array",
                                items: { type: "string" },
                              },
                              heading: {
                                type: "string",
                                description:
                                  "Plain text in the form Role @ Company, optionally followed by (current) when supported. Do not add Slack formatting.",
                              },
                            },
                            required: ["heading", "bullets"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: [
                        "currentRole",
                        "education",
                        "harperNote",
                        "location",
                        "preferences",
                        "tldr",
                        "workSummary",
                      ],
                      additionalProperties: false,
                    },
                    sources: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: ["string", "null"] },
                          url: { type: "string" },
                        },
                        required: ["title", "url"],
                        additionalProperties: false,
                      },
                    },
                    talentId: { type: "string" },
                  },
                  required: [
                    "talentId",
                    "internalReason",
                    "slackProfile",
                    "sources",
                  ],
                  additionalProperties: false,
                },
              },
              roleId: { type: "string" },
            },
            required: ["roleId", "candidates"],
            additionalProperties: false,
          },
        },
        workspaceId: { type: "string" },
      },
      required: ["workspaceId", "roles", "followUpQuestion"],
      additionalProperties: false,
    },
    strict: true,
  },
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function assistantMessage(response: unknown) {
  const root = record(response);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  return record(record(choices[0]).message);
}

function assistantText(message: Record<string, any>) {
  if (typeof message.content === "string") return text(message.content);
  if (!Array.isArray(message.content)) return "";
  return text(
    message.content
      .map((part: unknown) => {
        const item = record(part);
        return typeof item.text === "string"
          ? item.text
          : typeof item.content === "string"
            ? item.content
            : "";
      })
      .join("")
  );
}

function toolCalls(message: Record<string, any>): LlmToolCall[] {
  if (!Array.isArray(message.tool_calls)) return [];
  return message.tool_calls.flatMap((raw: unknown, index: number) => {
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
        id: text(item.id) || `auto_intro_tool_${index}_${crypto.randomUUID()}`,
        type: "function" as const,
      },
    ];
  });
}

function parseToolArguments(value: string) {
  const parsed = JSON.parse(value || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be an object");
  }
  return parsed as Record<string, unknown>;
}

function safeToolArguments(value: string) {
  try {
    return parseToolArguments(value);
  } catch {
    return null;
  }
}

async function emitLlmTrace(
  options: GenerateAutoIntroOptions | undefined,
  event: AutoIntroLlmTraceEvent
) {
  try {
    await options?.onTrace?.(event);
  } catch {
    // Debug streaming must never change generation or delivery behavior.
  }
}

function responseUsage(response: unknown) {
  const usage = record(response).usage;
  return usage && typeof usage === "object" && !Array.isArray(usage)
    ? (usage as Record<string, unknown>)
    : null;
}

async function createAutoIntroCompletion(args: {
  logUsage: boolean;
  messages: Array<Record<string, unknown>>;
  model: string;
  webToolsAvailable: boolean;
}) {
  const tools = args.webToolsAvailable
    ? [
        WEB_SEARCH_TOOL_DEFINITION,
        OPEN_URL_TOOL_DEFINITION,
        SUBMIT_AUTO_INTRO_TOOL,
      ]
    : [SUBMIT_AUTO_INTRO_TOOL];
  const result = await createChatCompletionWithFallback({
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: AUTO_INTRO_LLM_MAX_OUTPUT_TOKENS }
        : { max_tokens: AUTO_INTRO_LLM_MAX_OUTPUT_TOKENS }),
      messages: args.messages,
      temperature: 0.15,
      tool_choice: args.webToolsAvailable ? "auto" : "required",
      tools,
    }),
    debugLabel: "org/auto-intro:candidate-copy",
    fallbackModel:
      process.env.AUTO_INTRO_TO_COMPANY_LLM_FALLBACK_MODEL?.trim() ||
      GPT_56_TERRA_MODEL,
    model: args.model,
    openAIResponses: { reasoningEffort: "high" },
  });
  if (args.logUsage) {
    logLlmTokenUsage({
      label: "org/auto-intro:candidate-copy",
      model: result.model,
      response: result.response,
    });
  }
  return result;
}

export async function generateAutoIntroWorkspaceMessage(
  group: DossierGroup,
  options?: GenerateAutoIntroOptions
) {
  const admin = getSupabaseAdmin();
  const { systemPrompt, userPrompt } = buildAutoIntroLlmInput(group);
  const messages: Array<Record<string, any>> = [
    { content: systemPrompt, role: "system" },
    { content: userPrompt, role: "user" },
  ];
  let activeModel: string = GPT_56_LUNA_MODEL;
  const source = options?.source ?? AUTO_INTRO_LLM_SOURCE;
  let webToolCallCount = 0;

  await emitLlmTrace(options, {
    model: activeModel,
    systemPrompt,
    type: "prompt",
    userPrompt,
  });

  for (let loop = 0; loop < AUTO_INTRO_LLM_MAX_TOOL_LOOPS; loop += 1) {
    const iteration = loop + 1;
    const webToolsAvailable =
      webToolCallCount < AUTO_INTRO_LLM_MAX_WEB_TOOL_CALLS;
    await emitLlmTrace(options, {
      iteration,
      messageCount: messages.length,
      model: activeModel,
      type: "llm_request",
      webToolsAvailable,
    });
    const result = await createAutoIntroCompletion({
      logUsage: options?.logUsage !== false,
      messages,
      model: activeModel,
      webToolsAvailable,
    });
    activeModel = result.model;
    const responseMessage = assistantMessage(result.response);
    const calls = toolCalls(responseMessage);
    const content = assistantText(responseMessage);
    await emitLlmTrace(options, {
      content,
      iteration,
      model: activeModel,
      toolCalls: calls.map((call) => ({
        arguments: call.function.arguments,
        id: call.id,
        name: call.function.name,
      })),
      type: "llm_response",
      usage: responseUsage(result.response),
    });

    const returnSubmission = async (rawSubmission: unknown) => {
      const submission = parseAutoIntroLlmSubmission(rawSubmission, group);
      await emitLlmTrace(options, {
        model: activeModel,
        output: submission as unknown as Record<string, unknown>,
        type: "submission",
        webToolCallCount,
      });
      return {
        message: {
          ...submission,
          generation: { model: activeModel, source, webToolCallCount },
        },
        model: activeModel,
        webToolCallCount,
      };
    };

    if (calls.length === 0) {
      if (content) {
        try {
          return await returnSubmission(
            JSON.parse(
              content
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/\s*```$/i, "")
            )
          );
        } catch (error) {
          messages.push({
            content: `Your response was not a valid complete submission: ${
              error instanceof Error ? error.message : String(error)
            }. Call submit_auto_intro now.`,
            role: "user",
          });
          continue;
        }
      }
      messages.push({
        content: "Call submit_auto_intro now with the complete output.",
        role: "user",
      });
      continue;
    }

    messages.push({ ...responseMessage, role: "assistant" });
    const submitCalls = calls.filter(
      (call) => call.function.name === "submit_auto_intro"
    );
    const webCalls = calls.filter(
      (call) =>
        call.function.name === "web_search" || call.function.name === "open_url"
    );
    const addToolResult = async (call: LlmToolCall, toolContent: string) => {
      messages.push({
        content: toolContent,
        name: call.function.name,
        role: "tool",
        tool_call_id: call.id,
      });
      await emitLlmTrace(options, {
        callId: call.id,
        content: toolContent,
        iteration,
        name: call.function.name,
        type: "tool_result",
      });
    };
    const announceToolStart = (call: LlmToolCall) =>
      emitLlmTrace(options, {
        arguments: call.function.arguments,
        callId: call.id,
        input: safeToolArguments(call.function.arguments),
        iteration,
        name: call.function.name,
        type: "tool_start",
      });

    if (submitCalls.length === 1 && calls.length === 1) {
      const submitCall = submitCalls[0];
      await announceToolStart(submitCall);
      try {
        return await returnSubmission(
          parseToolArguments(submitCall.function.arguments)
        );
      } catch (error) {
        await addToolResult(
          submitCall,
          `Submission error: ${
            error instanceof Error ? error.message : String(error)
          }\nCorrect the complete payload and call submit_auto_intro again.`
        );
        continue;
      }
    }

    for (const call of calls) {
      await announceToolStart(call);
      if (call.function.name === "submit_auto_intro") {
        await addToolResult(
          call,
          "Submission error: submit_auto_intro must be the only tool call after research is complete."
        );
        continue;
      }
      if (!webCalls.includes(call)) {
        await addToolResult(
          call,
          `Tool error: unknown tool ${call.function.name}.`
        );
        continue;
      }
      if (webToolCallCount >= AUTO_INTRO_LLM_MAX_WEB_TOOL_CALLS) {
        await addToolResult(
          call,
          `Tool error: the shared web-tool budget of ${AUTO_INTRO_LLM_MAX_WEB_TOOL_CALLS} calls has been reached. Finish with submit_auto_intro.`
        );
        continue;
      }
      webToolCallCount += 1;
      try {
        const input = parseToolArguments(call.function.arguments);
        const toolResult =
          call.function.name === "web_search"
            ? await executeSharedWebSearch(input, { admin })
            : await executeSharedOpenUrl({ admin, input });
        await addToolResult(
          call,
          verbalizeAutoIntroWebToolResult(
            call.function.name as "open_url" | "web_search",
            toolResult
          )
        );
      } catch (error) {
        await addToolResult(
          call,
          `Tool error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  throw new Error(
    `Auto-intro LLM did not submit complete output for workspace ${group.workspaceId}`
  );
}

async function emitManualTrace(
  onTrace:
    | ((event: AutoIntroManualTraceEvent) => Promise<void> | void)
    | undefined,
  event: AutoIntroManualTraceEvent
) {
  try {
    await onTrace?.(event);
  } catch {
    // The one-time browser trace is observational and must not stop the run.
  }
}

export async function runManualAutoIntroToCompany(args: {
  onTrace?: (event: AutoIntroManualTraceEvent) => Promise<void> | void;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  await emitManualTrace(args.onTrace, {
    message: "후보자, 회사, 대상 역할 데이터를 불러오는 중입니다.",
    stage: "loading_context",
    type: "status",
  });
  const dossier = await fetchManualAutoIntroToCompanyCandidateDossier(args);

  await emitManualTrace(args.onTrace, {
    message: "실제 프롬프트로 LLM 메시지를 작성하는 중입니다.",
    stage: "generating",
    type: "status",
  });
  const generated = await generateAutoIntroWorkspaceMessage(dossier, {
    logUsage: false,
    onTrace: args.onTrace,
    source: MANUAL_AUTO_INTRO_LLM_SOURCE,
  });

  await emitManualTrace(args.onTrace, {
    message: "생성된 메시지를 회사 Slack으로 전송하는 중입니다.",
    stage: "delivering",
    type: "status",
  });
  const delivery = await sendManualAutoIntroToCompanyNotification({
    ...args,
    authored: generated.message,
  });
  await emitManualTrace(args.onTrace, {
    ...delivery,
    type: "delivery",
  });

  return {
    companyName: dossier.companyName,
    model: generated.model,
    ok: delivery.slackSent,
    roleTitle: dossier.roles[0]?.roleTitle ?? "Role",
    slackSent: delivery.slackSent,
    webToolCallCount: generated.webToolCallCount,
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
) {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;
        results[index] = await mapper(values[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function mergeGeneratedPairMessagesByWorkspace(
  messages: CodexAuthoredWorkspaceMessage[]
) {
  const byWorkspaceId = new Map<
    string,
    {
      followUpQuestion: string | null;
      messages: CodexAuthoredWorkspaceMessage[];
    }
  >();
  for (const message of messages) {
    const current = byWorkspaceId.get(message.workspaceId) ?? {
      followUpQuestion: null,
      messages: [],
    };
    current.messages.push(message);
    current.followUpQuestion ??= text(message.followUpQuestion) || null;
    byWorkspaceId.set(message.workspaceId, current);
  }

  return Array.from(byWorkspaceId, ([workspaceId, group]) => {
    const roleById = new Map<
      string,
      CodexAuthoredWorkspaceMessage["roles"][number]
    >();
    for (const message of group.messages) {
      for (const role of message.roles) {
        const existing = roleById.get(role.roleId);
        if (existing) {
          existing.candidates.push(...role.candidates);
        } else {
          roleById.set(role.roleId, {
            ...role,
            candidates: [...role.candidates],
          });
        }
      }
    }
    const firstGeneration = group.messages[0]?.generation;
    return {
      followUpQuestion: group.followUpQuestion,
      generation: {
        model: firstGeneration?.model ?? null,
        source: firstGeneration?.source ?? null,
        webToolCallCount: group.messages.reduce(
          (total, message) =>
            total + Number(message.generation?.webToolCallCount ?? 0),
          0
        ),
      },
      roles: Array.from(roleById.values()),
      workspaceId,
    } satisfies CodexAuthoredWorkspaceMessage;
  });
}

export async function runVercelCronAutoIntroToCompany(args?: {
  limit?: number;
  now?: Date;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  const dossiers = await fetchAutoIntroToCompanyCandidateDossiers(args);
  const generationTargets = dossiers.groups.filter(
    (group) => group.slackConnected
  );
  const generated = await mapWithConcurrency(
    generationTargets,
    AUTO_INTRO_LLM_CONCURRENCY,
    async (group) => {
      const roleId = group.roles[0]!.roleId;
      const talentId = group.roles[0]!.candidates[0]!.talentId;
      try {
        const result = await generateAutoIntroWorkspaceMessage(group);
        return {
          error: null,
          message: result.message,
          model: result.model,
          roleId,
          talentId,
          webToolCallCount: result.webToolCallCount,
          workspaceId: group.workspaceId,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          message: null,
          model: null,
          roleId,
          talentId,
          webToolCallCount: 0,
          workspaceId: group.workspaceId,
        };
      }
    }
  );
  const delivery = await sendCodexAuthoredAutoIntroToCompanyNotifications({
    ...args,
    groups: mergeGeneratedPairMessagesByWorkspace(
      generated.flatMap((item) => (item.message ? [item.message] : []))
    ),
  });
  const generationFailures = generated.filter((item) => item.error);
  return {
    delivery,
    generation: {
      failedPairCount: generationFailures.length,
      failures: generationFailures.map((item) => ({
        error: item.error,
        roleId: item.roleId,
        talentId: item.talentId,
        workspaceId: item.workspaceId,
      })),
      generatedPairCount: generated.length - generationFailures.length,
      requestedPairCount: generationTargets.length,
      totalWebToolCallCount: generated.reduce(
        (total, item) => total + item.webToolCallCount,
        0
      ),
      pairs: generated.map((item) => ({
        error: item.error,
        model: item.model,
        roleId: item.roleId,
        talentId: item.talentId,
        webToolCallCount: item.webToolCallCount,
        workspaceId: item.workspaceId,
      })),
    },
    selection: {
      eligibleCandidateCount: dossiers.eligibleCandidateCount,
      recentPendingConnectionCount: dossiers.recentPendingConnectionCount,
      roleSummaryDue: dossiers.roleSummaryDue,
      roleSummaryWorkspaceCount: dossiers.roleSummaryWorkspaceCount,
      skippedAlreadySentCount: dossiers.skippedAlreadySentCount,
      skippedLaterStageCount: dossiers.skippedLaterStageCount,
      skippedMissingCodexReasonCount: dossiers.skippedMissingCodexReasonCount,
      skippedMissingFitCount: dossiers.skippedMissingFitCount,
      skippedNoChannelCount: dossiers.skippedNoChannelCount,
      skippedRoleSummaryNoChannelCount:
        dossiers.skippedRoleSummaryNoChannelCount,
      skippedUnsupportedFitKindCount: dossiers.skippedUnsupportedFitKindCount,
    },
  };
}
