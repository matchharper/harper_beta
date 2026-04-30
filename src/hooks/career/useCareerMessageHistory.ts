import { useCallback, useMemo } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  CareerMessage,
  CareerMessagePayload,
  SessionResponse,
} from "@/components/career/types";
import { getErrorMessage, toUiMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

type CareerMessagesPage = {
  messages: CareerMessagePayload[];
  nextBeforeMessageId: number | null;
};

type UseCareerMessageHistoryArgs = {
  conversationId: string | null;
  fetchWithAuth: FetchWithAuth;
  enabled: boolean;
  initialSessionPage?: Pick<
    SessionResponse,
    "messages" | "nextBeforeMessageId"
  > | null;
};

export const careerMessageHistoryKey = (conversationId: string | null) =>
  ["career-message-history", conversationId] as const;

const toMessagePage = (
  payload: Pick<SessionResponse, "messages" | "nextBeforeMessageId">
): CareerMessagesPage => ({
  messages: payload.messages,
  nextBeforeMessageId: payload.nextBeforeMessageId,
});

export const useCareerMessageHistory = ({
  conversationId,
  fetchWithAuth,
  enabled,
  initialSessionPage,
}: UseCareerMessageHistoryArgs) => {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => careerMessageHistoryKey(conversationId),
    [conversationId]
  );

  const fetchMessagePage = useCallback(
    async (beforeMessageId?: number | null) => {
      if (!conversationId) {
        return {
          messages: [],
          nextBeforeMessageId: null,
        } satisfies CareerMessagesPage;
      }

      const searchParams = new URLSearchParams({
        messageLimit: "20",
      });

      if (beforeMessageId) {
        searchParams.set("beforeMessageId", String(beforeMessageId));
      }

      const response = await fetchWithAuth(
        `/api/talent/session?${searchParams.toString()}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as Partial<SessionResponse> &
        Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "대화 메시지를 불러오지 못했습니다.")
        );
      }

      return {
        messages: Array.isArray(payload.messages)
          ? (payload.messages as CareerMessagePayload[])
          : [],
        nextBeforeMessageId:
          typeof payload.nextBeforeMessageId === "number"
            ? payload.nextBeforeMessageId
            : null,
      } satisfies CareerMessagesPage;
    },
    [conversationId, fetchWithAuth]
  );

  const infinite = useInfiniteQuery({
    queryKey,
    enabled: enabled && Boolean(conversationId),
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

  return {
    ...infinite,
    messages,
    hasOlderMessages: Boolean(infinite.hasNextPage),
    loadOlderMessages: infinite.fetchNextPage,
    loadingOlderMessages: infinite.isFetchingNextPage,
    invalidateMessageHistory,
    appendLatestMessagesToCache,
  };
};
