import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";
import type {
  GoogleCalendarCompleteInput,
  GoogleCalendarCompleteResult,
  GoogleCalendarConnectResult,
  GoogleCalendarStatus,
} from "@/lib/integrations/googleCalendarTypes";

const ENDPOINT = "/api/org/integrations/google-calendar";
type PersonalIntegrationContext = { userId: string; workspaceId: string };

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
  } catch {
    return "Asia/Seoul";
  }
}

export function orgGoogleCalendarQueryOptions(
  args: PersonalIntegrationContext & { enabled?: boolean }
) {
  return queryOptions({
    queryKey: queryKeys.org.googleCalendar(args.userId, args.workspaceId),
    enabled: (args.enabled ?? true) && Boolean(args.userId && args.workspaceId),
    queryFn: ({ signal }) =>
      fetchWithInternalAuth<GoogleCalendarStatus>(
        `${ENDPOINT}?workspaceId=${encodeURIComponent(args.workspaceId)}`,
        { signal }
      ),
    staleTime: 15_000,
    retry: 1,
  });
}

export function useOrgGoogleCalendar(
  args: PersonalIntegrationContext & { enabled?: boolean }
) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.personalIntegrations(args.userId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.meetingAvailabilityAll,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.meetingSchedulesAll,
      }),
    ]);
  const statusQuery = useQuery(orgGoogleCalendarQueryOptions(args));
  const connect = useMutation({
    mutationFn: () =>
      fetchWithInternalAuth<GoogleCalendarConnectResult>(
        `${ENDPOINT}/connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timezone: browserTimezone(),
            workspaceId: args.workspaceId,
          }),
        }
      ),
    retry: false,
    onSettled: invalidate,
  });
  const complete = useMutation({
    mutationFn: (
      input: Omit<GoogleCalendarCompleteInput, "timezone" | "workspaceId">
    ) =>
      fetchWithInternalAuth<GoogleCalendarCompleteResult>(
        `${ENDPOINT}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            timezone: browserTimezone(),
            workspaceId: args.workspaceId,
          }),
        }
      ),
    retry: false,
    onSettled: invalidate,
  });
  const disconnect = useMutation({
    mutationFn: () =>
      fetchWithInternalAuth<GoogleCalendarStatus>(ENDPOINT, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: args.workspaceId }),
      }),
    retry: false,
    onSettled: invalidate,
  });
  return { statusQuery, connect, complete, disconnect };
}
