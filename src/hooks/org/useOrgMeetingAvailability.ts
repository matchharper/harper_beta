import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  MeetingAvailabilityDocument,
  MeetingAvailabilityResponse,
} from "@/lib/meetings/availability";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";

export function orgMeetingAvailabilityQueryOptions(args: {
  enabled?: boolean;
  workspaceId: string;
}) {
  return queryOptions({
    enabled: (args.enabled ?? true) && Boolean(args.workspaceId),
    queryFn: () =>
      fetchWithInternalAuth<MeetingAvailabilityResponse>(
        `/api/org/meeting-availability?workspaceId=${encodeURIComponent(args.workspaceId)}`
      ),
    queryKey: queryKeys.org.meetingAvailability(args.workspaceId),
    staleTime: 15_000,
  });
}

export function useOrgMeetingAvailability(args: {
  enabled?: boolean;
  workspaceId: string;
}) {
  return useQuery(orgMeetingAvailabilityQueryOptions(args));
}

export function useSaveOrgMeetingAvailability(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      availability: MeetingAvailabilityDocument;
      expectedVersion: number | null;
    }) =>
      fetchWithInternalAuth<MeetingAvailabilityResponse>(
        "/api/org/meeting-availability",
        {
          body: JSON.stringify({ ...args, workspaceId }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        }
      ),
    onSuccess: (payload) => {
      queryClient.setQueryData(
        queryKeys.org.meetingAvailability(workspaceId),
        payload
      );
    },
  });
}
