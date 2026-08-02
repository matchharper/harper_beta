import type { User } from "@supabase/supabase-js";
import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
  usesMaxCompletionTokensForModel,
  type ChatCompletionFallbackReason,
} from "@/lib/llm/llm";
import { extractLlmTokenUsage } from "@/lib/llm/usageLogging";
import {
  DEFAULT_ORG_AGENT_MODEL,
  getOrgAgentFallbackModel,
  ORG_AGENT_GROK_MODEL,
  isOrgAgentModelId,
  resolveOrgAgentModel,
  type OrgAgentModelId,
} from "@/lib/org/agent/modelConfig";
import {
  buildOrgAgentPromptContext,
  filterOrgAgentMentionsForWorkspace,
} from "@/lib/org/agent/context";
import {
  buildOrgAgentSystemPrompt,
  buildOrgAgentUserPrompt,
} from "@/lib/org/agent/prompts";
import {
  serializeOrgAgentToolError,
  serializeOrgAgentToolResult,
} from "@/lib/org/agent/promptFormat";
import { maybeSummarizeOrgAgentConversation } from "@/lib/org/agent/summary";
import {
  ensureOrgAgentConversation,
  insertOrgAgentMessage,
} from "@/lib/org/agent/store";
import {
  createOrgAgentToolExecutionState,
  executeOrgAgentTool,
  getOrgAgentToolStatusLabel,
  OrgAgentToolInputError,
  promoteOrgAgentToolReadVisibility,
  type OrgAgentToolExecutionState,
} from "@/lib/org/agent/toolExecution";
import { isOrgAgentToolName, ORG_AGENT_TOOLS } from "@/lib/org/agent/tools";
import type {
  OrgAgentMention,
  OrgAgentMessage,
  OrgAgentMessageMetadata,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";
import { OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export type OrgAgentChatEventName =
  | "assistant_message"
  | "done"
  | "error"
  | "text_delta"
  | "tool_status"
  | "user_message";

export type OrgAgentChatEmitter = (
  event: OrgAgentChatEventName,
  data: unknown
) => void;

export type OrgAgentChatResult = {
  assistantMessage: OrgAgentMessage;
  conversationId: string;
  model: OrgAgentModelId | string;
  userMessage: OrgAgentMessage;
};

type OrgAgentLlmToolCall = {
  function: {
    arguments: string;
    name: string;
  };
  id: string;
  type: "function";
};

type OrgAgentLlmMessage = {
  content: string;
  name?: string;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: OrgAgentLlmToolCall[];
};

// A normal multi-step turn is search -> read -> update -> final answer.
const MAX_TOOL_LOOPS = 4;
const MAX_TOTAL_TOOL_CALLS = 5;

type OrgAgentTurnUsage = NonNullable<OrgAgentMessageMetadata["llmUsage"]>;

function createTurnUsage(): OrgAgentTurnUsage {
  return {
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    completionCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function addCompletionUsage(usage: OrgAgentTurnUsage, response: any) {
  const current = extractLlmTokenUsage(response);
  usage.cacheCreationInputTokens += current.cacheCreationInputTokens ?? 0;
  usage.cacheReadInputTokens += current.cacheReadInputTokens ?? 0;
  usage.completionCount += 1;
  usage.inputTokens += current.inputTokens ?? 0;
  usage.outputTokens += current.outputTokens ?? 0;
  usage.totalTokens += current.totalTokens ?? 0;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function chunkText(text: string) {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    const next = Math.min(text.length, index + 24);
    chunks.push(text.slice(index, next));
    index = next;
  }
  return chunks;
}

function nowLog(label: string, status: OrgAgentThinkingLog["status"]) {
  return {
    at: new Date().toISOString(),
    label,
    status,
  } satisfies OrgAgentThinkingLog;
}

function getVisibleErrorMessage(error: unknown) {
  const detail = getLlmErrorMessage(error);
  if (process.env.NODE_ENV !== "production" && detail) return detail;
  return "지금은 에이전트 응답을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function extractAssistantText(message: any) {
  if (typeof message?.content === "string") {
    return normalizeText(message.content);
  }
  if (!Array.isArray(message?.content)) return "";
  return normalizeText(
    message.content
      .map((item: any) =>
        typeof item?.text === "string"
          ? item.text
          : typeof item?.content === "string"
            ? item.content
            : ""
      )
      .join("")
  );
}

function normalizeToolCalls(message: any): OrgAgentLlmToolCall[] {
  if (!Array.isArray(message?.tool_calls)) return [];
  return message.tool_calls.map((toolCall: any) => {
    const rawArguments = toolCall?.function?.arguments;
    return {
      function: {
        arguments:
          typeof rawArguments === "string"
            ? rawArguments
            : JSON.stringify(rawArguments ?? {}),
        name: normalizeText(toolCall?.function?.name),
      },
      id: normalizeText(toolCall?.id) || `org_tool_${crypto.randomUUID()}`,
      type: "function" as const,
    };
  });
}

function parseToolArguments(rawArguments: string) {
  try {
    const parsed = rawArguments ? JSON.parse(rawArguments) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new OrgAgentToolInputError("tool arguments must be an object");
  } catch (error) {
    if (error instanceof OrgAgentToolInputError) throw error;
    throw new OrgAgentToolInputError("tool arguments are not valid JSON");
  }
}

function buildFallbackReply(state: OrgAgentToolExecutionState) {
  const updates = state.updateSummaries;
  if (updates.length === 1) {
    return `반영했습니다. ${updates[0]}`;
  }
  if (updates.length > 1) {
    return "요청하신 변경 사항을 모두 반영했습니다.";
  }
  return "요청을 처리하려면 대상 포지션이나 후보자를 조금 더 구체적으로 알려주세요.";
}

async function runCompletion(args: {
  allowTools: boolean;
  messages: OrgAgentLlmMessage[];
  model: OrgAgentModelId;
}) {
  return createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: 2_000 }
        : { max_tokens: 2_000 }),
      messages: args.messages as any,
      temperature: 0.1,
      ...(args.allowTools
        ? {
            tool_choice: "auto" as const,
            tools: ORG_AGENT_TOOLS as any,
          }
        : {}),
    }),
    debugLabel: "org/agent:chat",
    fallbackModel: getOrgAgentFallbackModel(args.model),
    model: args.model,
  });
}

async function runOrgAgentToolLoop(args: {
  actorId: string;
  admin: ReturnType<typeof getSupabaseAdmin>;
  context: Awaited<ReturnType<typeof buildOrgAgentPromptContext>>;
  conversation: Awaited<
    ReturnType<typeof ensureOrgAgentConversation>
  >["conversation"];
  currentUserMessageId: number;
  emit?: OrgAgentChatEmitter;
  mentions: OrgAgentMention[];
  model: OrgAgentModelId;
  slackThreadId: string | null;
  user: User;
  userLabel?: string | null;
  userMessage: string;
}) {
  const messages: OrgAgentLlmMessage[] = [
    { content: buildOrgAgentSystemPrompt(), role: "system" },
    {
      content: buildOrgAgentUserPrompt({
        context: args.context,
        mentions: args.mentions,
        userLabel: args.userLabel,
        userMessage: args.userMessage,
      }),
      role: "user",
    },
  ];
  const state = createOrgAgentToolExecutionState(args.context);
  let activeModel = args.model;
  let fallbackReason: ChatCompletionFallbackReason | null = null;
  let totalToolCalls = 0;
  const usage = createTurnUsage();

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    let completion: Awaited<ReturnType<typeof runCompletion>>;
    try {
      completion = await runCompletion({
        allowTools: true,
        messages,
        model: activeModel,
      });
    } catch (error) {
      if (state.updateSummaries.length === 0) throw error;
      console.error(
        "[org/agent:post-tool-completion]",
        getLlmErrorMessage(error)
      );
      return {
        fallbackReason,
        model: activeModel,
        reply: buildFallbackReply(state),
        state,
        usage,
      };
    }
    activeModel = completion.model as OrgAgentModelId;
    fallbackReason = fallbackReason ?? completion.fallbackReason ?? null;
    addCompletionUsage(usage, completion.response);

    const responseMessage = completion.response?.choices?.[0]?.message;
    const assistantText = extractAssistantText(responseMessage);
    const toolCalls = normalizeToolCalls(responseMessage);
    if (toolCalls.length === 0) {
      return {
        fallbackReason,
        model: activeModel,
        reply: assistantText || buildFallbackReply(state),
        state,
        usage,
      };
    }

    messages.push({
      content: assistantText,
      role: "assistant",
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
        messages.push({
          content: serializeOrgAgentToolError(
            "Tool call budget reached. Continue with a final answer."
          ),
          name: toolName || "unknown_tool",
          role: "tool",
          tool_call_id: toolCall.id,
        });
        continue;
      }
      totalToolCalls += 1;

      if (!isOrgAgentToolName(toolName)) {
        state.toolResults.push({
          callId: toolCall.id,
          name: toolName || "unknown_tool",
          status: "error",
          summary: "허용되지 않은 도구 호출",
        });
        messages.push({
          content: serializeOrgAgentToolError(
            "Unknown tool. Use only the provided tools."
          ),
          name: toolName || "unknown_tool",
          role: "tool",
          tool_call_id: toolCall.id,
        });
        continue;
      }

      args.emit?.("tool_status", {
        label: getOrgAgentToolStatusLabel({
          name: toolName,
          status: "running",
        }),
        status: "running",
      });

      try {
        const result = await executeOrgAgentTool({
          actorId: args.actorId,
          admin: args.admin,
          callId: toolCall.id,
          conversation: args.conversation,
          currentUserMessageId: args.currentUserMessageId,
          input: parseToolArguments(toolCall.function.arguments),
          name: toolName,
          slackThreadId: args.slackThreadId,
          state,
          user: args.user,
        });
        args.emit?.("tool_status", {
          label: getOrgAgentToolStatusLabel({ name: toolName, status: "done" }),
          status: "done",
        });
        messages.push({
          content: serializeOrgAgentToolResult(toolName, result),
          name: toolName,
          role: "tool",
          tool_call_id: toolCall.id,
        });
      } catch (error) {
        const isInputError =
          error instanceof OrgAgentToolInputError ||
          (error instanceof OrgHttpError && error.status < 500);
        const errorMessage = isInputError
          ? error.message
          : "The tool could not be completed. Do not claim success.";
        console.error("[org/agent:tool]", {
          callId: toolCall.id,
          error: getLlmErrorMessage(error),
          name: toolName,
        });
        state.toolResults.push({
          callId: toolCall.id,
          name: toolName,
          status: "error",
          summary: isInputError ? error.message : "도구 실행 실패",
        });
        args.emit?.("tool_status", {
          label: getOrgAgentToolStatusLabel({
            name: toolName,
            status: "error",
          }),
          status: "error",
        });
        messages.push({
          content: serializeOrgAgentToolError(errorMessage),
          name: toolName,
          role: "tool",
          tool_call_id: toolCall.id,
        });
      }
    }
    promoteOrgAgentToolReadVisibility(state);
  }

  let finalCompletion: Awaited<ReturnType<typeof runCompletion>>;
  try {
    finalCompletion = await runCompletion({
      allowTools: false,
      messages: [
        ...messages,
        {
          content:
            "Tool use is finished for this turn. Give the final concise user-facing answer now. Do not claim success for failed tools.",
          role: "user",
        },
      ],
      model: activeModel,
    });
  } catch (error) {
    if (state.updateSummaries.length === 0) throw error;
    console.error(
      "[org/agent:final-post-tool-completion]",
      getLlmErrorMessage(error)
    );
    return {
      fallbackReason,
      model: activeModel,
      reply: buildFallbackReply(state),
      state,
      usage,
    };
  }
  activeModel = finalCompletion.model as OrgAgentModelId;
  fallbackReason = fallbackReason ?? finalCompletion.fallbackReason ?? null;
  addCompletionUsage(usage, finalCompletion.response);
  return {
    fallbackReason,
    model: activeModel,
    reply:
      extractAssistantText(finalCompletion.response?.choices?.[0]?.message) ||
      buildFallbackReply(state),
    state,
    usage,
  };
}

function buildAssistantMetadata(args: {
  fallbackReason: ChatCompletionFallbackReason | null;
  model: string;
  state: OrgAgentToolExecutionState;
  usage: OrgAgentTurnUsage;
}): OrgAgentMessageMetadata {
  const lastRequestChange = args.state.requestChanges.at(-1);
  return {
    ...(args.state.actions.length > 0 && { actions: args.state.actions }),
    ...(args.state.candidateConnectionConfirmations.length > 0 && {
      candidateConnectionConfirmations:
        args.state.candidateConnectionConfirmations,
    }),
    fallbackReason: args.fallbackReason,
    llmUsage: args.usage,
    model: args.model,
    ...(lastRequestChange && { requestChange: lastRequestChange }),
    ...(args.state.requestChanges.length > 0 && {
      requestChanges: args.state.requestChanges,
    }),
    source: "org_agent_chat",
    ...(args.state.toolResults.length > 0 && {
      toolResults: args.state.toolResults,
    }),
  };
}

export async function runOrgAgentChat(args: {
  assistantMessageMetadata?: OrgAgentMessageMetadata;
  emit?: OrgAgentChatEmitter;
  messageType?: string;
  messageUserId?: string | null;
  mentions?: OrgAgentMention[];
  message: string;
  model?: unknown;
  /** @deprecated Ignored. The conversation is workspace-scoped. */
  roleId?: string | null;
  slackAssistantUserId?: string | null;
  slackThreadId?: string;
  slackUserId?: string | null;
  slackUserMessageTs?: string | null;
  userMessageMetadata?: OrgAgentMessageMetadata;
  user: User;
  workspaceId: string;
}): Promise<OrgAgentChatResult> {
  const userMessageText = normalizeText(args.message);
  if (!userMessageText) throw new OrgHttpError(400, "message is required");
  if (userMessageText.length > 8_000) {
    throw new OrgHttpError(400, "message is too long");
  }

  const modelConfig = resolveOrgAgentModel(args.model);
  const thinkingLogs: OrgAgentThinkingLog[] = [];
  const { admin, conversation } = await ensureOrgAgentConversation({
    user: args.user,
    workspaceId: args.workspaceId,
  });

  let mentions: OrgAgentMention[] = [];
  try {
    mentions = await filterOrgAgentMentionsForWorkspace({
      admin,
      mentions: args.mentions ?? [],
      workspaceId: conversation.company_workspace_id,
    });
  } catch (error) {
    console.warn(
      "[org/agent:mention-filter]",
      getLlmErrorMessage(error) || error
    );
  }

  const userMessage = await insertOrgAgentMessage({
    admin,
    content: userMessageText,
    conversation,
    mentions,
    metadata: {
      model: modelConfig.model,
      source: "org_agent_user",
      ...args.userMessageMetadata,
    },
    messageType: args.messageType,
    role: "user",
    slackMessageTs: args.slackUserMessageTs,
    slackThreadId: args.slackThreadId,
    slackUserId: args.slackUserId,
    userId:
      args.messageUserId === undefined ? args.user.id : args.messageUserId,
  });
  args.emit?.("user_message", userMessage);

  try {
    thinkingLogs.push(nowLog("회사와 최근 추천 정보를 읽는 중", "running"));
    args.emit?.("tool_status", {
      label: "회사와 최근 추천 정보를 읽는 중",
      status: "running",
    });
    const context = await buildOrgAgentPromptContext({
      admin,
      beforeMessageId: userMessage.id,
      conversation,
      slackHistoryTruncated: Boolean(
        args.userMessageMetadata?.historyTruncated
      ),
      slackThreadId: args.slackThreadId,
    });
    thinkingLogs[thinkingLogs.length - 1] = nowLog(
      "회사와 최근 추천 정보 확인 완료",
      "done"
    );
    args.emit?.("tool_status", {
      label: "회사와 최근 추천 정보 확인 완료",
      status: "done",
    });

    thinkingLogs.push(nowLog("응답 생성 중", "running"));
    args.emit?.("tool_status", {
      label: "응답 생성 중",
      status: "running",
    });

    const llmResult = await runOrgAgentToolLoop({
      actorId: args.slackUserId ?? args.user.id,
      admin,
      context,
      conversation,
      currentUserMessageId: userMessage.id,
      emit: args.emit,
      mentions,
      model: modelConfig.model,
      slackThreadId: args.slackThreadId ?? null,
      user: args.user,
      userLabel: args.userMessageMetadata?.slackUserName
        ? `${args.userMessageMetadata.slackUserName} [${args.slackUserId ?? "-"}]`
        : args.slackUserId
          ? `Slack user [${args.slackUserId}]`
          : "user",
      userMessage: userMessageText,
    });
    const usedTool = llmResult.state.toolResults.length > 0;
    if (usedTool) {
      thinkingLogs[thinkingLogs.length - 1] = nowLog("응답 생성 완료", "done");
      args.emit?.("tool_status", {
        label: "응답 생성 완료",
        status: "done",
      });
    } else {
      // 일반 텍스트 응답에는 완료 상태를 메시지 위에 남기지 않는다.
      thinkingLogs.length = 0;
    }

    for (const delta of chunkText(llmResult.reply)) {
      args.emit?.("text_delta", { delta });
    }

    const assistantMessage = await insertOrgAgentMessage({
      admin,
      content: llmResult.reply,
      conversation,
      metadata: {
        ...buildAssistantMetadata(llmResult),
        ...args.assistantMessageMetadata,
      },
      messageType: args.messageType,
      model: llmResult.model,
      role: "assistant",
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackAssistantUserId,
      thinkingLogs,
    });
    args.emit?.("assistant_message", assistantMessage);

    if (args.messageType !== "slack") {
      void maybeSummarizeOrgAgentConversation({
        admin,
        conversation,
        model: isOrgAgentModelId(llmResult.model)
          ? llmResult.model
          : DEFAULT_ORG_AGENT_MODEL,
      });
    }

    return {
      assistantMessage,
      conversationId: conversation.id,
      model: llmResult.model,
      userMessage,
    };
  } catch (error) {
    if (thinkingLogs.length > 0) {
      thinkingLogs[thinkingLogs.length - 1] = nowLog("응답 생성 실패", "error");
    }
    const detail = getVisibleErrorMessage(error);
    const message =
      "지금은 에이전트 응답을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
    const assistantMessage = await insertOrgAgentMessage({
      admin,
      content: message,
      conversation,
      metadata: {
        model: modelConfig.model,
        source: "org_agent_error",
        ...args.assistantMessageMetadata,
      },
      messageType: args.messageType,
      model: modelConfig.model,
      role: "assistant",
      slackThreadId: args.slackThreadId,
      slackUserId: args.slackAssistantUserId,
      status: "failed",
      thinkingLogs,
    });
    args.emit?.("error", { error: detail });
    args.emit?.("assistant_message", assistantMessage);
    return {
      assistantMessage,
      conversationId: conversation.id,
      model: modelConfig.model,
      userMessage,
    };
  }
}
