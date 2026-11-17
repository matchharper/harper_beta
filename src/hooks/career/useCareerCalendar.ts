import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";
import type {
  GoogleCalendarStatus,
  GoogleCalendarConnectResult,
  GoogleCalendarCompleteResult,
  GoogleCalendarCompleteInput,
} from "@/lib/integrations/googleCalendarTypes";
const endpoint = "/api/talent/integrations/google-calendar";
export function careerCalendarQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.careerCalendar(userId),
    enabled: Boolean(userId),
    staleTime: 15000,
    queryFn: ({ signal }) =>
      fetchWithInternalAuth<GoogleCalendarStatus>(
        `${endpoint}?workspaceId=career`,
        { signal }
      ),
  });
}
export function useCareerCalendar(userId: string) {
  const client = useQueryClient(),
    invalidate = () =>
      client.invalidateQueries({ queryKey: queryKeys.careerCalendar(userId) });
  const request = <T>(
    path: string,
    body: Record<string, unknown>,
    method = "POST"
  ) =>
    fetchWithInternalAuth<T>(`${endpoint}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, workspaceId: "career" }),
    });
  const status = useQuery(careerCalendarQueryOptions(userId));
  const connect = useMutation({
    mutationFn: () => request<GoogleCalendarConnectResult>("/connect", {}),
    onSettled: invalidate,
  });
  const complete = useMutation({
    mutationFn: (
      input: Omit<GoogleCalendarCompleteInput, "timezone" | "workspaceId">
    ) => request<GoogleCalendarCompleteResult>("/complete", input),
    onSettled: invalidate,
  });
  const disconnect = useMutation({
    mutationFn: () => request<GoogleCalendarStatus>("", {}, "DELETE"),
    onSettled: invalidate,
  });
  return { status, connect, complete, disconnect };
}
