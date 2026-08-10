import { useCallback, useMemo, useState } from "react";
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  fetchWithInternalAuth,
  getInternalAccessToken,
  refreshInternalAccessToken,
} from "@/lib/internalApiClient";
import { filterOrgAgentMentionCandidates } from "@/lib/org/agent/mentionCandidates";
import type { OrgAgentModelId } from "@/lib/org/agent/modelConfig";
import type {
  OrgAgentMeetingRequestResponse,
  OrgAgentMention,
  OrgAgentMentionCandidate,
  OrgAgentMentionsResponse,
  OrgAgentMessage,
  OrgAgentMessagesResponse,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";
import type { ChatAttachmentPayload } from "@/types/chat";
import { queryKeys } from "@/lib/queryKeys";
import {
  splitChatTextDeltaForReveal,
  waitForChatTextReveal,
} from "@/lib/chat/progressiveText";

type OrgAgentMessagesPage = OrgAgentMessagesResponse;

function mergeMessages(
  existing: OrgAgentMessage[],
  incoming: OrgAgentMessage[]
) {
  const merged = [...existing];
  const indexById = new Map(
    merged.map((message, index) => [message.id, index])
  );
  for (const message of incoming) {
    const existingIndex = indexById.get(message.id);
    if (typeof existingIndex === "number") {
      merged[existingIndex] = message;
      continue;
    }
    indexById.set(message.id, merged.length);
    merged.push(message);
  }
  return merged.sort((left, right) => left.id - right.id);
}

function parseSseBlock(block: string) {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return { data: JSON.parse(dataLines.join("\n")), event };
  } catch {
    return { data: dataLines.join("\n"), event };
  }
}

function toThinkingLog(value: unknown): OrgAgentThinkingLog | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = String(record.label ?? "").trim();
  if (!label) return null;
  const status =
    record.status === "running" ||
    record.status === "done" ||
    record.status === "error"
      ? record.status
      : undefined;
  return {
    at: new Date().toISOString(),
    label,
    status,
  };
}

function sanitizeVisibleAgentError(value: unknown) {
  return String(value ?? "")
    .replace(/claude-sonnet-5(?:-[\w.-]+)?/gi, "선택한 모델")
    .replace(/deepseek-v4-(?:flash|pro)(?:-[\w.-]+)?/gi, "선택한 모델")
    .replace(/grok-4\.3(?:-[\w.-]+)?/gi, "선택한 모델")
    .replace(/gpt-5\.6-luna(?:-[\w.-]+)?/gi, "선택한 모델")
    .replace(/gpt-5\.6-terra(?:-[\w.-]+)?/gi, "선택한 모델")
    .trim();
}

export function orgAgentMessageHistoryQueryOptions(args: {
  enabled?: boolean;
  mode?: "general" | "role_creation";
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  const roleId = args.roleId?.trim() ?? "";
  const mode = args.mode ?? "general";
  return infiniteQueryOptions({
    queryKey: queryKeys.org.agentMessages({ mode, roleId, workspaceId }),
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: "30",
        mode,
        workspaceId,
      });
      if (roleId) params.set("roleId", roleId);
      if (pageParam) params.set("beforeMessageId", String(pageParam));
      return fetchWithInternalAuth<OrgAgentMessagesPage>(
        `/api/org/agent/messages?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled:
      (args.enabled ?? true) &&
      Boolean(workspaceId) &&
      (mode === "general" || Boolean(roleId)),
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  });
}

export function useOrgAgentMessageHistory(args: {
  enabled?: boolean;
  mode?: "general" | "role_creation";
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  const queryClient = useQueryClient();
  const workspaceId = args.workspaceId?.trim() ?? "";
  const options = orgAgentMessageHistoryQueryOptions(args);
  const queryKey = options.queryKey;
  const infinite = useInfiniteQuery(options);

  const messages = useMemo(() => {
    return [...(infinite.data?.pages ?? [])]
      .reverse()
      .flatMap((page) => page.messages);
  }, [infinite.data?.pages]);

  const appendMessagesToCache = useCallback(
    (incomingMessages: OrgAgentMessage[]) => {
      if (incomingMessages.length === 0) return;
      queryClient.setQueryData<
        InfiniteData<OrgAgentMessagesPage, number | null>
      >(queryKey, (current) => {
        const pages = current?.pages ? [...current.pages] : [];
        const pageParams = current?.pageParams
          ? [...current.pageParams]
          : [null];
        const latestPage = pages[0] ?? {
          conversation: {
            conversationId: "",
            roleId: null,
            title: null,
            workspaceId,
          },
          hasMore: false,
          messages: [],
          nextCursor: null,
          ok: true as const,
        };
        pages[0] = {
          ...latestPage,
          messages: mergeMessages(latestPage.messages, incomingMessages),
        };
        return { pageParams, pages };
      });
    },
    [queryClient, queryKey, workspaceId]
  );

  return {
    ...infinite,
    appendMessagesToCache,
    hasOlderMessages: Boolean(infinite.hasNextPage),
    loadOlderMessages: infinite.fetchNextPage,
    loadingOlderMessages: infinite.isFetchingNextPage,
    messages,
  };
}

export function orgAgentMentionCandidatesQueryOptions(args: {
  enabled?: boolean;
  workspaceId?: string | null;
}) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  return queryOptions({
    queryKey: queryKeys.org.agentMentions({ workspaceId }),
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId });
      const payload = await fetchWithInternalAuth<OrgAgentMentionsResponse>(
        `/api/org/agent/mentions?${params.toString()}`
      );
      return payload.candidates;
    },
    enabled: (args.enabled ?? true) && Boolean(workspaceId),
    staleTime: 60_000,
  });
}

export function useOrgAgentMentionCandidates(args: {
  enabled?: boolean;
  query?: string | null;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  return useQuery({
    ...orgAgentMentionCandidatesQueryOptions(args),
    select: (candidates) =>
      filterOrgAgentMentionCandidates({
        candidates,
        query: args.query,
        roleId: args.roleId,
      }),
  });
}

export function useOrgAgentChat(args: {
  appendMessagesToCache: (messages: OrgAgentMessage[]) => void;
  currentUserId?: string | null;
  mode?: "general" | "role_creation";
  onRoleCreated?: (roleId: string) => void;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  const queryClient = useQueryClient();
  const appendMessagesToCache = args.appendMessagesToCache;
  const onRoleCreated = args.onRoleCreated;
  const activeWorkspaceId = args.workspaceId?.trim() ?? "";
  const activeRoleId = args.roleId?.trim() ?? "";
  const mode = args.mode ?? "general";
  const [error, setError] = useState<string | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<
    "idle" | "pending" | "streaming"
  >("idle");
  const [isStreaming, setIsStreaming] = useState(false);
  const [optimisticUserMessage, setOptimisticUserMessage] =
    useState<OrgAgentMessage | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [thinkingLogs, setThinkingLogs] = useState<OrgAgentThinkingLog[]>([]);

  const sendMessage = useCallback(
    async (input: {
      attachments?: ChatAttachmentPayload[];
      draftRoleId?: string | null;
      mentions?: OrgAgentMention[];
      message: string;
      model?: OrgAgentModelId | string | null;
    }) => {
      const workspaceId = activeWorkspaceId;
      if (!workspaceId) return;

      setError(null);
      setAssistantStatus("pending");
      setIsStreaming(true);
      setOptimisticUserMessage({
        authorUserId: args.currentUserId?.trim() || null,
        content: input.message,
        createdAt: new Date().toISOString(),
        id: -Date.now(),
        mentions: input.mentions ?? [],
        metadata: {
          attachments: (input.attachments ?? []).map((attachment) => ({
            kind: attachment.kind,
            mime: attachment.mime,
            name: attachment.name,
            size: attachment.size,
            truncated: attachment.truncated,
            url: attachment.url,
          })),
          source: "org_agent_user_optimistic",
        },
        model: input.model ? String(input.model) : null,
        role: "user",
        status: "pending",
        thinkingLogs: [],
      });
      setStreamingText("");
      setThinkingLogs([]);

      let accessToken = await getInternalAccessToken();
      if (!accessToken) {
        accessToken = await refreshInternalAccessToken();
      }
      if (!accessToken) {
        setError("로그인 세션을 찾지 못했습니다. 다시 로그인해 주세요.");
        setAssistantStatus("idle");
        setOptimisticUserMessage(null);
        setIsStreaming(false);
        return;
      }

      let responseRoleId =
        activeRoleId ||
        (mode === "role_creation" ? (input.draftRoleId?.trim() ?? "") : "");
      let queriesInvalidated = false;
      try {
        let response = await fetch("/api/org/agent/chat", {
          body: JSON.stringify({
            mentions: input.mentions ?? [],
            attachments: input.attachments ?? [],
            draftRoleId: input.draftRoleId ?? null,
            message: input.message,
            mode,
            model: input.model ?? null,
            roleId: activeRoleId || null,
            workspaceId,
          }),
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        if (response.status === 401) {
          const refreshedToken = await refreshInternalAccessToken();
          if (refreshedToken && refreshedToken !== accessToken) {
            accessToken = refreshedToken;
            response = await fetch("/api/org/agent/chat", {
              body: JSON.stringify({
                mentions: input.mentions ?? [],
                attachments: input.attachments ?? [],
                draftRoleId: input.draftRoleId ?? null,
                message: input.message,
                mode,
                model: input.model ?? null,
                roleId: activeRoleId || null,
                workspaceId,
              }),
              headers: {
                Accept: "text/event-stream",
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              method: "POST",
            });
          }
        }

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(
            sanitizeVisibleAgentError(payload.error) ||
              "에이전트 응답을 만들지 못했습니다."
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\n\n/);
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            const parsed = parseSseBlock(block);
            if (!parsed) continue;
            if (parsed.event === "user_message") {
              appendMessagesToCache([parsed.data as OrgAgentMessage]);
              setOptimisticUserMessage(null);
            } else if (parsed.event === "assistant_message") {
              appendMessagesToCache([parsed.data as OrgAgentMessage]);
              setAssistantStatus("idle");
              setOptimisticUserMessage(null);
              setStreamingText("");
              setThinkingLogs([]);
            } else if (parsed.event === "role_created") {
              const roleId = String(
                (parsed.data as { roleId?: unknown }).roleId ?? ""
              ).trim();
              if (roleId) {
                responseRoleId = roleId;
                onRoleCreated?.(roleId);
              }
            } else if (parsed.event === "text_delta") {
              const delta = String(
                (parsed.data as { delta?: unknown }).delta ?? ""
              );
              if (delta) {
                setAssistantStatus("streaming");
                for (const revealChunk of splitChatTextDeltaForReveal(delta)) {
                  setStreamingText((current) => current + revealChunk);
                  await waitForChatTextReveal();
                }
              }
            } else if (parsed.event === "tool_status") {
              const log = toThinkingLog(parsed.data);
              if (log) {
                setThinkingLogs((current) => [...current.slice(-5), log]);
              }
            } else if (parsed.event === "error") {
              const message = sanitizeVisibleAgentError(
                (parsed.data as { error?: unknown }).error ??
                  "에이전트 응답을 만들지 못했습니다."
              );
              setAssistantStatus("idle");
              setError(message);
            }
          }
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.org.all }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.org.agentMessages({
              mode,
              roleId: responseRoleId,
              workspaceId,
            }),
          }),
          ...(responseRoleId
            ? [
                queryClient.invalidateQueries({
                  queryKey: queryKeys.org.roleNotifications(
                    workspaceId,
                    responseRoleId
                  ),
                }),
              ]
            : []),
        ]);
        queriesInvalidated = true;
      } catch (error) {
        setError(
          error instanceof Error
            ? sanitizeVisibleAgentError(error.message)
            : "에이전트 응답을 만들지 못했습니다."
        );
      } finally {
        if (mode === "role_creation" && !queriesInvalidated) {
          await Promise.allSettled([
            queryClient.invalidateQueries({ queryKey: queryKeys.org.all }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.org.agentMessages({
                mode,
                roleId: responseRoleId,
                workspaceId,
              }),
            }),
            ...(responseRoleId
              ? [
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.org.roleNotifications(
                      workspaceId,
                      responseRoleId
                    ),
                  }),
                ]
              : []),
          ]);
        }
        setOptimisticUserMessage(null);
        setAssistantStatus("idle");
        setStreamingText("");
        setThinkingLogs([]);
        setIsStreaming(false);
      }
    },
    [
      activeRoleId,
      activeWorkspaceId,
      appendMessagesToCache,
      args.currentUserId,
      mode,
      onRoleCreated,
      queryClient,
    ]
  );

  return {
    assistantStatus,
    error,
    isStreaming,
    optimisticUserMessage,
    sendMessage,
    setError,
    streamingText,
    thinkingLogs,
  };
}

export function useConfirmOrgRoleCreation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      actionId: string;
      decision: "no" | "yes";
      messageId: number;
      roleId: string;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<{
        alreadyHandled: boolean;
        assistantMessage?: OrgAgentMessage | null;
        completed: boolean;
        ok: true;
        roleId: string;
      }>("/api/org/agent/role-creation/confirm", {
        body: JSON.stringify(args),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.agentMessages({
          mode: "role_creation",
          roleId: variables.roleId,
          workspaceId: variables.workspaceId,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.roleNotifications(
          variables.workspaceId,
          variables.roleId
        ),
      });
    },
  });
}

export function useSendOrgAgentMeetingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      actionId?: string | null;
      messageId?: number | null;
      reason?: string | null;
      roleId: string;
      topic?: string | null;
      workspaceId: string;
    }) =>
      fetchWithInternalAuth<OrgAgentMeetingRequestResponse>(
        "/api/org/agent/meeting-request",
        {
          body: JSON.stringify(args),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.agentMessages({
          workspaceId: variables.workspaceId,
        }),
      });
    },
  });
}
