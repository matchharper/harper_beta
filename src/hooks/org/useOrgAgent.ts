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
import { queryKeys } from "@/lib/queryKeys";

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
    .replace(/grok-4\.3(?:-[\w.-]+)?/gi, "선택한 모델")
    .replace(/gpt-5\.6-luna(?:-[\w.-]+)?/gi, "선택한 모델")
    .trim();
}

export function orgAgentMessageHistoryQueryOptions(args: {
  enabled?: boolean;
  workspaceId?: string | null;
}) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  return infiniteQueryOptions({
    queryKey: queryKeys.org.agentMessages({ workspaceId }),
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: "30",
        workspaceId,
      });
      if (pageParam) params.set("beforeMessageId", String(pageParam));
      return fetchWithInternalAuth<OrgAgentMessagesPage>(
        `/api/org/agent/messages?${params.toString()}`
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: (args.enabled ?? true) && Boolean(workspaceId),
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  });
}

export function useOrgAgentMessageHistory(args: {
  enabled?: boolean;
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
  query?: string | null;
  workspaceId?: string | null;
}) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  const query = args.query?.trim() ?? "";
  return queryOptions({
    queryKey: queryKeys.org.agentMentions({ query, workspaceId }),
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId });
      if (query) params.set("query", query);
      const payload = await fetchWithInternalAuth<OrgAgentMentionsResponse>(
        `/api/org/agent/mentions?${params.toString()}`
      );
      return payload.candidates;
    },
    enabled: (args.enabled ?? true) && Boolean(workspaceId),
    staleTime: 20_000,
  });
}

export function useOrgAgentMentionCandidates(args: {
  enabled?: boolean;
  query?: string | null;
  workspaceId?: string | null;
}) {
  return useQuery(orgAgentMentionCandidatesQueryOptions(args));
}

export function useOrgAgentChat(args: {
  appendMessagesToCache: (messages: OrgAgentMessage[]) => void;
  workspaceId?: string | null;
}) {
  const queryClient = useQueryClient();
  const appendMessagesToCache = args.appendMessagesToCache;
  const activeWorkspaceId = args.workspaceId?.trim() ?? "";
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [optimisticUserMessage, setOptimisticUserMessage] =
    useState<OrgAgentMessage | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [thinkingLogs, setThinkingLogs] = useState<OrgAgentThinkingLog[]>([]);

  const sendMessage = useCallback(
    async (input: {
      mentions?: OrgAgentMention[];
      message: string;
      model?: OrgAgentModelId | string | null;
    }) => {
      const workspaceId = activeWorkspaceId;
      if (!workspaceId) return;

      setError(null);
      setIsStreaming(true);
      setOptimisticUserMessage({
        content: input.message,
        createdAt: new Date().toISOString(),
        id: -Date.now(),
        mentions: input.mentions ?? [],
        metadata: { source: "org_agent_user_optimistic" },
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
        setOptimisticUserMessage(null);
        setIsStreaming(false);
        return;
      }

      try {
        let response = await fetch("/api/org/agent/chat", {
          body: JSON.stringify({
            mentions: input.mentions ?? [],
            message: input.message,
            model: input.model ?? null,
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
                message: input.message,
                model: input.model ?? null,
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
              setOptimisticUserMessage(null);
              setStreamingText("");
              setThinkingLogs([]);
            } else if (parsed.event === "text_delta") {
              const delta = String(
                (parsed.data as { delta?: unknown }).delta ?? ""
              );
              setStreamingText((current) => current + delta);
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
              setError(message);
            }
          }
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.org.all }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.org.agentMessages({ workspaceId }),
          }),
        ]);
      } catch (error) {
        setError(
          error instanceof Error
            ? sanitizeVisibleAgentError(error.message)
            : "에이전트 응답을 만들지 못했습니다."
        );
      } finally {
        setOptimisticUserMessage(null);
        setStreamingText("");
        setThinkingLogs([]);
        setIsStreaming(false);
      }
    },
    [activeWorkspaceId, appendMessagesToCache, queryClient]
  );

  return {
    error,
    isStreaming,
    optimisticUserMessage,
    sendMessage,
    setError,
    streamingText,
    thinkingLogs,
  };
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
