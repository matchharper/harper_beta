import { useCallback, useMemo } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  CareerMessage,
  CareerMessagePayload,
  CareerStage,
  SessionResponse,
} from "@/components/career/types";
import { getErrorMessage, toUiMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

type CareerMessagesPage = {
  conversation: {
    id: string;
    stage: CareerStage;
  } | null;
  messages: CareerMessagePayload[];
  nextBeforeMessageId: number | null;
};

type UseCareerMessageHistoryArgs = {
  conversationId: string | null;
  fetchWithAuth: FetchWithAuth;
  enabled: boolean;
  initialSessionPage?: Pick<
    SessionResponse,
    "conversation" | "messages" | "nextBeforeMessageId"
  > | null;
  userId: string | null;
};

export const careerMessageHistoryKey = (
  conversationId: string | null,
  userId: string | null
) =>
  ["career-message-history", conversationId?.trim() || null, userId] as const;

const toMessagePage = (
  payload: Pick<
    SessionResponse,
    "conversation" | "messages" | "nextBeforeMessageId"
  >
): CareerMessagesPage => ({
  conversation: {
    id: payload.conversation.id,
    stage: payload.conversation.stage,
  },
  messages: payload.messages,
  nextBeforeMessageId: payload.nextBeforeMessageId,
});

export const useCareerMessageHistory = ({
  conversationId,
  fetchWithAuth,
  enabled,
  initialSessionPage,
  userId,
}: UseCareerMessageHistoryArgs) => {
  const tCareer = useCareerMessageFormatter();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => careerMessageHistoryKey(conversationId, userId),
    [conversationId, userId]
  );

  const fetchMessagePage = useCallback(
    async (beforeMessageId?: number | null) => {
      if (!conversationId && !userId) {
        return {
          conversation: null,
          messages: [],
          nextBeforeMessageId: null,
        } satisfies CareerMessagesPage;
      }

      const searchParams = new URLSearchParams({
        messageLimit: "20",
      });

      if (conversationId) {
        searchParams.set("conversationId", conversationId);
      }
      if (beforeMessageId) {
        searchParams.set("beforeMessageId", String(beforeMessageId));
      }

      const response = await fetchWithAuth(
        `/api/talent/messages?${searchParams.toString()}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as Partial<CareerMessagesPage> &
        Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, tCareer(H.conversationMessagesLoadFailed))
        );
      }

      return {
        conversation:
          payload.conversation &&
          typeof payload.conversation === "object" &&
          typeof payload.conversation.id === "string" &&
          (payload.conversation.stage === "profile" ||
            payload.conversation.stage === "chat" ||
            payload.conversation.stage === "completed")
            ? {
                id: payload.conversation.id,
                stage: payload.conversation.stage,
              }
            : null,
        messages: Array.isArray(payload.messages)
          ? (payload.messages as CareerMessagePayload[])
          : [],
        nextBeforeMessageId:
          typeof payload.nextBeforeMessageId === "number"
            ? payload.nextBeforeMessageId
            : null,
      } satisfies CareerMessagesPage;
    },
    [conversationId, fetchWithAuth, tCareer, userId]
  );

  const infinite = useInfiniteQuery({
    queryKey,
    enabled: enabled && Boolean(conversationId || userId),
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => fetchMessagePage(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextBeforeMessageId ?? undefined,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 30_000,
    initialData:
      initialSessionPage && conversationId
        ? {
            pages: [toMessagePage(initialSessionPage)],
            pageParams: [null],
          }
        : undefined,
  });

  const messages = useMemo<CareerMessage[]>(() => {
    const pages = infinite.data?.pages ?? [];
    return [...pages]
      .reverse()
      .flatMap((page) => page.messages.map((message) => toUiMessage(message)));
  }, [infinite.data?.pages]);

  const conversation = useMemo(() => {
    for (const page of infinite.data?.pages ?? []) {
      if (page.conversation) return page.conversation;
    }
    return null;
  }, [infinite.data?.pages]);

  const invalidateMessageHistory = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const appendLatestMessagesToCache = useCallback(
    (incomingMessages: CareerMessagePayload[]) => {
      if (incomingMessages.length === 0) return;

      queryClient.setQueryData<InfiniteData<CareerMessagesPage, number | null>>(
        queryKey,
        (current) => {
          const nextPages = current?.pages ? [...current.pages] : [];
          const nextPageParams = current?.pageParams
            ? [...current.pageParams]
            : [null];
          const latestPage = nextPages[0] ?? {
            conversation: null,
            messages: [],
            nextBeforeMessageId: null,
          };

          const mergedMessages = [...latestPage.messages];
          const indexById = new Map<string, number>();

          for (let index = 0; index < mergedMessages.length; index += 1) {
            indexById.set(String(mergedMessages[index].id), index);
          }

          for (const message of incomingMessages) {
            const id = String(message.id);
            const existingIndex = indexById.get(id);
            if (typeof existingIndex === "number") {
              mergedMessages[existingIndex] = message;
              continue;
            }

            indexById.set(id, mergedMessages.length);
            mergedMessages.push(message);
          }

          mergedMessages.sort((a, b) => a.id - b.id);
          nextPages[0] = {
            ...latestPage,
            messages: mergedMessages,
          };

          return {
            pages: nextPages,
            pageParams: nextPageParams,
          };
        }
      );
    },
    [queryClient, queryKey]
  );

  const removeMessagesFromCache = useCallback(
    (messageIds: Array<number | string>) => {
      if (messageIds.length === 0) return;

      const idsToRemove = new Set(messageIds.map((id) => String(id)));
      queryClient.setQueryData<InfiniteData<CareerMessagesPage, number | null>>(
        queryKey,
        (current) => {
          if (!current?.pages?.length) return current;

          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              messages: page.messages.filter(
                (message) => !idsToRemove.has(String(message.id))
              ),
            })),
          };
        }
      );
    },
    [queryClient, queryKey]
  );

  return {
    ...infinite,
    conversation,
    messages,
    hasOlderMessages: Boolean(infinite.hasNextPage),
    loadOlderMessages: infinite.fetchNextPage,
    loadingOlderMessages: infinite.isFetchingNextPage,
    invalidateMessageHistory,
    appendLatestMessagesToCache,
    removeMessagesFromCache,
  };
};
