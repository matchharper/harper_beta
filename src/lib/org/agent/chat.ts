import type { User } from "@supabase/supabase-js";
import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
  type ChatCompletionFallbackReason,
} from "@/lib/llm/llm";
import {
  DEFAULT_ORG_AGENT_MODEL,
  ORG_AGENT_GROK_MODEL,
  resolveOrgAgentModel,
  type OrgAgentModelId,
} from "@/lib/org/agent/modelConfig";
import {
  buildOrgAgentPromptContext,
  filterOrgAgentMentionsForRole,
} from "@/lib/org/agent/context";
import {
  buildOrgAgentSystemPrompt,
  buildOrgAgentUserPrompt,
} from "@/lib/org/agent/prompts";
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

const MAX_TOOL_LOOPS = 3;
const MAX_TOTAL_TOOL_CALLS = 3;

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
  const updates = state.requestChanges.map((change) => change.changeSummary);
  if (updates.length === 1) {
    return `반영했습니다. 앞으로 ${updates[0]} 기준을 다음 후보 탐색과 추천에 적용할게요.`;
  }
  if (updates.length > 1) {
    return `요청하신 기준을 모두 반영했습니다. 다음 후보 탐색과 추천부터 적용할게요.`;
  }
  if (state.actions.some((action) => action.kind === "schedule_meeting")) {
    return "이 요청은 Harper 팀과 직접 이야기하는 편이 좋겠습니다. 아래 버튼을 누르면 미팅 요청을 전달할게요.";
  }
  return "조금 더 구체적으로 알려주시면 다음 후보 탐색 기준에 맞게 정리해둘게요.";
}

async function runCompletion(args: {
  allowTools: boolean;
  messages: OrgAgentLlmMessage[];
  model: OrgAgentModelId;
}) {
  return createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
    buildRequest: () => ({
      max_tokens: 2_000,
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
    fallbackModel:
      args.model === DEFAULT_ORG_AGENT_MODEL
        ? ORG_AGENT_GROK_MODEL
        : DEFAULT_ORG_AGENT_MODEL,
    model: args.model,
  });
}

async function runOrgAgentToolLoop(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  context: Awaited<ReturnType<typeof buildOrgAgentPromptContext>>;
  conversation: Awaited<
    ReturnType<typeof ensureOrgAgentConversation>
  >["conversation"];
  emit?: OrgAgentChatEmitter;
  mentions: OrgAgentMention[];
  model: OrgAgentModelId;
  user: User;
  userMessage: string;
}) {
  const messages: OrgAgentLlmMessage[] = [
    { content: buildOrgAgentSystemPrompt(), role: "system" },
    {
      content: buildOrgAgentUserPrompt({
        context: args.context,
        mentions: args.mentions,
        userMessage: args.userMessage,
      }),
      role: "user",
    },
  ];
  const state = createOrgAgentToolExecutionState(args.context);
  let activeModel = args.model;
  let fallbackReason: ChatCompletionFallbackReason | null = null;
  let totalToolCalls = 0;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    let completion: Awaited<ReturnType<typeof runCompletion>>;
    try {
      completion = await runCompletion({
        allowTools: true,
        messages,
        model: activeModel,
      });
    } catch (error) {
      if (state.actions.length === 0) throw error;
      console.error(
        "[org/agent:post-tool-completion]",
        getLlmErrorMessage(error)
      );
      return {
        fallbackReason,
        model: activeModel,
        reply: buildFallbackReply(state),
        state,
      };
    }
    activeModel = completion.model as OrgAgentModelId;
    fallbackReason = fallbackReason ?? completion.fallbackReason ?? null;

    const responseMessage = completion.response?.choices?.[0]?.message;
    const assistantText = extractAssistantText(responseMessage);
    const toolCalls = normalizeToolCalls(responseMessage);
    if (toolCalls.length === 0) {
      return {
        fallbackReason,
        model: activeModel,
        reply: assistantText || buildFallbackReply(state),
        state,
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
          content: JSON.stringify({
            error: "Tool call budget reached. Continue with a final answer.",
            status: "error",
          }),
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
          content: JSON.stringify({
            error: "Unknown tool. Use only the provided tools.",
            status: "error",
          }),
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
          admin: args.admin,
          callId: toolCall.id,
          conversation: args.conversation,
          input: parseToolArguments(toolCall.function.arguments),
          mentions: args.mentions,
          name: toolName,
          state,
          user: args.user,
        });
        args.emit?.("tool_status", {
          label: getOrgAgentToolStatusLabel({ name: toolName, status: "done" }),
          status: "done",
        });
        messages.push({
          content: JSON.stringify(result),
          name: toolName,
          role: "tool",
          tool_call_id: toolCall.id,
        });
      } catch (error) {
        const isInputError = error instanceof OrgAgentToolInputError;
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
          content: JSON.stringify({ error: errorMessage, status: "error" }),
          name: toolName,
          role: "tool",
          tool_call_id: toolCall.id,
        });
      }
    }
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
    if (state.actions.length === 0) throw error;
    console.error(
      "[org/agent:final-post-tool-completion]",
      getLlmErrorMessage(error)
    );
    return {
      fallbackReason,
      model: activeModel,
      reply: buildFallbackReply(state),
      state,
    };
  }
  activeModel = finalCompletion.model as OrgAgentModelId;
  fallbackReason = fallbackReason ?? finalCompletion.fallbackReason ?? null;
  return {
    fallbackReason,
    model: activeModel,
    reply:
      extractAssistantText(finalCompletion.response?.choices?.[0]?.message) ||
      buildFallbackReply(state),
    state,
  };
}

function buildAssistantMetadata(args: {
  fallbackReason: ChatCompletionFallbackReason | null;
  model: string;
  state: OrgAgentToolExecutionState;
}): OrgAgentMessageMetadata {
  const lastRequestChange = args.state.requestChanges.at(-1);
  return {
    ...(args.state.actions.length > 0 && { actions: args.state.actions }),
    fallbackReason: args.fallbackReason,
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
  emit?: OrgAgentChatEmitter;
  mentions?: OrgAgentMention[];
  message: string;
  model?: unknown;
  roleId: string;
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
    roleId: args.roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });

  let mentions: OrgAgentMention[] = [];
  try {
    mentions = await filterOrgAgentMentionsForRole({
      mentions: args.mentions ?? [],
      roleId: conversation.role_id,
      user: args.user,
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
    },
    role: "user",
    userId: args.user.id,
  });
  args.emit?.("user_message", userMessage);

  try {
    thinkingLogs.push(nowLog("역할과 최근 후보 피드를 읽는 중", "running"));
    args.emit?.("tool_status", {
      label: "역할과 최근 후보 피드를 읽는 중",
      status: "running",
    });
    const context = await buildOrgAgentPromptContext({
      admin,
      beforeMessageId: userMessage.id,
      conversation,
      mentions,
    });
    thinkingLogs[thinkingLogs.length - 1] = nowLog(
      "역할과 최근 후보 피드 확인 완료",
      "done"
    );
    args.emit?.("tool_status", {
      label: "역할과 최근 후보 피드 확인 완료",
      status: "done",
    });

    thinkingLogs.push(nowLog("응답 생성 중", "running"));
    args.emit?.("tool_status", {
      label: "응답 생성 중",
      status: "running",
    });

    const llmResult = await runOrgAgentToolLoop({
      admin,
      context,
      conversation,
      emit: args.emit,
      mentions,
      model: modelConfig.model,
      user: args.user,
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
      metadata: buildAssistantMetadata(llmResult),
      model: llmResult.model,
      role: "assistant",
      thinkingLogs,
    });
    args.emit?.("assistant_message", assistantMessage);

    void maybeSummarizeOrgAgentConversation({
      admin,
      conversation,
      model:
        llmResult.model === "grok-4.3" || llmResult.model === "claude-sonnet-5"
          ? llmResult.model
          : DEFAULT_ORG_AGENT_MODEL,
    });

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
      },
      model: modelConfig.model,
      role: "assistant",
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
