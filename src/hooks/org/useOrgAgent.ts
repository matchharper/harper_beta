import { useCallback, useMemo } from "react";
import {
  infiniteQueryOptions,
  type QueryClient,
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
import { upsertOrgAgentThinkingLog } from "@/lib/org/agent/thinkingLogs";
import type { ChatAttachmentPayload } from "@/types/chat";
import { queryKeys } from "@/lib/queryKeys";
import {
  EMPTY_ORG_AGENT_LIVE_CHAT,
  getOrgAgentLiveChatKey,
  useOrgAgentLiveChatStore,
} from "@/store/useOrgAgentLiveChatStore";
import {
  splitChatTextDeltaForReveal,
  waitForChatTextReveal,
} from "@/lib/chat/progressiveText";

type OrgAgentMessagesPage = OrgAgentMessagesResponse;

function compareOrgAgentMessages(
  left: OrgAgentMessage,
  right: OrgAgentMessage
) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (
    Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    leftTime !== rightTime
  ) {
    return leftTime - rightTime;
  }
  return left.id - right.id;
}

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
  return merged.sort(compareOrgAgentMessages);
}

export function appendOrgAgentMessagesToCache(
  queryClient: QueryClient,
  args: {
    mode: "general" | "role_creation";
    roleId?: string | null;
    workspaceId: string;
  },
  incomingMessages: OrgAgentMessage[]
) {
  if (incomingMessages.length === 0) return;
  const roleId = args.roleId?.trim() ?? "";
  const queryKey = queryKeys.org.agentMessages({
    mode: args.mode,
    roleId,
    workspaceId: args.workspaceId,
  });

  queryClient.setQueryData<InfiniteData<OrgAgentMessagesPage, number | null>>(
    queryKey,
    (current) => {
      const pages = current?.pages ? [...current.pages] : [];
      const pageParams = current?.pageParams ? [...current.pageParams] : [null];
      const latestPage = pages[0] ?? {
        conversation: {
          conversationId: "",
          roleId: roleId || null,
          title: null,
          workspaceId: args.workspaceId,
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
    }
  );
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
  const at = String(record.at ?? "").trim();
  const id = String(record.id ?? "").trim();
  const label = String(record.label ?? "").trim();
  if (!label) return null;
  const status =
    record.status === "running" ||
    record.status === "done" ||
    record.status === "error"
      ? record.status
      : undefined;
  const icon =
    record.icon === "read" ||
    record.icon === "write" ||
    record.icon === "send" ||
    record.icon === "run" ||
    record.icon === "search" ||
    record.icon === "link"
      ? record.icon
      : undefined;
  return {
    at: at || new Date().toISOString(),
    ...(id ? { id } : {}),
    ...(icon ? { icon } : {}),
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
  const infinite = useInfiniteQuery(options);

  const messages = useMemo(() => {
    return [...(infinite.data?.pages ?? [])]
      .reverse()
      .flatMap((page) => page.messages)
      .sort(compareOrgAgentMessages);
  }, [infinite.data?.pages]);

  const appendMessagesToCache = useCallback(
    (incomingMessages: OrgAgentMessage[]) => {
      appendOrgAgentMessagesToCache(
        queryClient,
        {
          mode: args.mode ?? "general",
          roleId: args.roleId,
          workspaceId,
        },
        incomingMessages
      );
    },
    [args.mode, args.roleId, queryClient, workspaceId]
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
  query?: string | null;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  const query = args.query?.trim() ?? "";
  const roleId = args.roleId?.trim() ?? "";
  return infiniteQueryOptions({
    queryKey: queryKeys.org.agentMentions({ query, roleId, workspaceId }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(pageParam),
        query,
        workspaceId,
      });
      if (roleId) params.set("roleId", roleId);
      return fetchWithInternalAuth<OrgAgentMentionsResponse>(
        `/api/org/agent/mentions?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
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
  const infinite = useInfiniteQuery(
    orgAgentMentionCandidatesQueryOptions(args)
  );
  const candidates = useMemo(() => {
    const seenTalentIds = new Set<string>();
    return (infinite.data?.pages ?? [])
      .flatMap((page) => page.candidates)
      .filter((candidate) => {
        if (seenTalentIds.has(candidate.talentId)) return false;
        seenTalentIds.add(candidate.talentId);
        return true;
      });
  }, [infinite.data?.pages]);

  return {
    ...infinite,
    candidates,
    totalCount: infinite.data?.pages[0]?.totalCount ?? candidates.length,
  };
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
  const liveChatKey = getOrgAgentLiveChatKey({
    mode,
    roleId: activeRoleId,
    workspaceId: activeWorkspaceId,
  });
  const liveChat = useOrgAgentLiveChatStore(
    (state) => state.chats[liveChatKey] ?? EMPTY_ORG_AGENT_LIVE_CHAT
  );
  const setError = useCallback(
    (error: string | null) =>
      useOrgAgentLiveChatStore.getState().patch(liveChatKey, { error }),
    [liveChatKey]
  );

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

      let streamLiveChatKey = liveChatKey;
      const optimisticUserMessage: OrgAgentMessage = {
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
        sourceSurface: "web",
        status: "pending",
        thinkingLogs: [],
      };
      useOrgAgentLiveChatStore
        .getState()
        .start(streamLiveChatKey, optimisticUserMessage);

      let accessToken = await getInternalAccessToken();
      if (!accessToken) {
        accessToken = await refreshInternalAccessToken();
      }
      if (!accessToken) {
        useOrgAgentLiveChatStore.getState().patch(streamLiveChatKey, {
          assistantStatus: "idle",
          error: "로그인 세션을 찾지 못했습니다. 다시 로그인해 주세요.",
          isStreaming: false,
          optimisticUserMessage: null,
        });
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
          useOrgAgentLiveChatStore.getState().patch(streamLiveChatKey, {
            error:
              sanitizeVisibleAgentError(payload.error) ||
              "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
          });
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
              if (responseRoleId !== activeRoleId) {
                appendOrgAgentMessagesToCache(
                  queryClient,
                  {
                    mode,
                    roleId: responseRoleId,
                    workspaceId,
                  },
                  [parsed.data as OrgAgentMessage]
                );
              }
              useOrgAgentLiveChatStore.getState().patch(streamLiveChatKey, {
                optimisticUserMessage: null,
              });
            } else if (parsed.event === "assistant_message") {
              appendMessagesToCache([parsed.data as OrgAgentMessage]);
              if (responseRoleId !== activeRoleId) {
                appendOrgAgentMessagesToCache(
                  queryClient,
                  {
                    mode,
                    roleId: responseRoleId,
                    workspaceId,
                  },
                  [parsed.data as OrgAgentMessage]
                );
              }
              useOrgAgentLiveChatStore.getState().finish(streamLiveChatKey);
            } else if (parsed.event === "role_created") {
              const roleId = String(
                (parsed.data as { roleId?: unknown }).roleId ?? ""
              ).trim();
              if (roleId) {
                responseRoleId = roleId;
                const nextLiveChatKey = getOrgAgentLiveChatKey({
                  mode,
                  roleId,
                  workspaceId,
                });
                useOrgAgentLiveChatStore
                  .getState()
                  .move(streamLiveChatKey, nextLiveChatKey);
                streamLiveChatKey = nextLiveChatKey;
                onRoleCreated?.(roleId);
              }
            } else if (parsed.event === "text_delta") {
              const delta = String(
                (parsed.data as { delta?: unknown }).delta ?? ""
              );
              if (delta) {
                useOrgAgentLiveChatStore.getState().patch(streamLiveChatKey, {
                  assistantStatus: "streaming",
                });
                for (const revealChunk of splitChatTextDeltaForReveal(delta)) {
                  const current =
                    useOrgAgentLiveChatStore.getState().chats[
                      streamLiveChatKey
                    ] ?? EMPTY_ORG_AGENT_LIVE_CHAT;
                  useOrgAgentLiveChatStore.getState().patch(streamLiveChatKey, {
                    streamingText: current.streamingText + revealChunk,
                  });
                  await waitForChatTextReveal();
                }
              }
            } else if (parsed.event === "tool_status") {
              const log = toThinkingLog(parsed.data);
              if (log) {
                const current =
                  useOrgAgentLiveChatStore.getState().chats[
                    streamLiveChatKey
                  ] ?? EMPTY_ORG_AGENT_LIVE_CHAT;
                useOrgAgentLiveChatStore.getState().patch(streamLiveChatKey, {
                  thinkingLogs: upsertOrgAgentThinkingLog(
                    current.thinkingLogs,
                    log,
                    6
                  ),
                });
              }
            } else if (parsed.event === "error") {
              const message = sanitizeVisibleAgentError(
                (parsed.data as { error?: unknown }).error ??
                  "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요."
              );
              useOrgAgentLiveChatStore.getState().patch(streamLiveChatKey, {
                assistantStatus: "idle",
                isStreaming: false,
              });
              useOrgAgentLiveChatStore.getState().patch(streamLiveChatKey, {
                error: message,
              });
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
        useOrgAgentLiveChatStore.getState().patch(streamLiveChatKey, {
          error:
            error instanceof Error
              ? sanitizeVisibleAgentError(error.message)
              : "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
        });
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
        useOrgAgentLiveChatStore.getState().finish(streamLiveChatKey);
      }
    },
    [
      activeRoleId,
      activeWorkspaceId,
      appendMessagesToCache,
      args.currentUserId,
      liveChatKey,
      mode,
      onRoleCreated,
      queryClient,
    ]
  );

  return {
    assistantStatus: liveChat.assistantStatus,
    error: liveChat.error,
    isStreaming: liveChat.isStreaming,
    optimisticUserMessage: liveChat.optimisticUserMessage,
    sendMessage,
    setError,
    streamingText: liveChat.streamingText,
    thinkingLogs: liveChat.thinkingLogs,
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
