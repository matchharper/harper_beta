import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsEmailTestCommand,
  OpsEmailTestHistory,
} from "@/lib/ops/careerEmailTest.server";

const key = (userId: string) => ["ops-email-test", userId] as const;

export function useOpsEmailTests(userId: string) {
  return useInfiniteQuery({
    queryKey: key(userId),
    queryFn: ({ pageParam }) =>
      fetchWithInternalAuth<OpsEmailTestHistory>(
        `/api/internal/career/email-test?userId=${encodeURIComponent(userId)}&offset=${pageParam}`
      ),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.items.some(
          (item) => item.status === "queued" || item.status === "processing"
        )
      )
        ? 1500
        : false,
  });
}

export function useSendOpsEmailTest(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: OpsEmailTestCommand) =>
      fetchWithInternalAuth<{ jobId: string }>(
        "/api/internal/career/email-test",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }
      ),
    onSettled: () => client.invalidateQueries({ queryKey: key(userId) }),
  });
}

export function useRunOpsEmailTest(userId: string) {
  const client = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), [userId]);
  return useMutation({
    mutationFn: async (jobId: string) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      while (!current.signal.aborted) {
        const result = await fetchWithInternalAuth<{ pending: boolean }>(
          "/api/internal/career/email-test/run",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, jobId }),
            signal: current.signal,
          }
        );
        await client.invalidateQueries({ queryKey: key(userId) });
        if (!result.pending) return;
        // Durable preparation may need another consumer invocation. Keep the
        // same job ID and lease, and leave transport failures for explicit retry.
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            current.signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, 1500);
          current.signal.addEventListener("abort", finish, { once: true });
          if (current.signal.aborted) finish();
        });
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: key(userId) }),
  });
}
