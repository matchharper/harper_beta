import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MeetingScheduleDetailResponse,
  MeetingScheduleListResponse,
  MeetingScheduleMutationResponse,
} from "@/lib/meetings/scheduleDraft";
import type { MeetingCalendarRetryResponse } from "@/lib/meetings/meetingCalendar";
import type { MeetingInvitationPreviewResponse } from "@/lib/meetings/invitation";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";

export function useOrgMeetingSchedules(args: {
  enabled?: boolean;
  workspaceId: string;
}) {
  return useQuery({
    enabled: (args.enabled ?? true) && Boolean(args.workspaceId),
    queryFn: () =>
      fetchWithInternalAuth<MeetingScheduleListResponse>(
        `/api/org/meeting-schedules?workspaceId=${encodeURIComponent(args.workspaceId)}`
      ),
    queryKey: queryKeys.org.meetingSchedule(args.workspaceId, "all"),
    staleTime: 10_000,
  });
}

export function useOrgMeetingSchedule(args: {
  enabled?: boolean;
  scheduleId: string;
  workspaceId: string;
}) {
  return useQuery({
    enabled:
      (args.enabled ?? true) &&
      Boolean(args.scheduleId) &&
      Boolean(args.workspaceId),
    queryFn: () =>
      fetchWithInternalAuth<MeetingScheduleDetailResponse>(
        `/api/org/meeting-schedules/${encodeURIComponent(args.scheduleId)}?workspaceId=${encodeURIComponent(args.workspaceId)}`
      ),
    queryKey: queryKeys.org.meetingSchedule(args.workspaceId, args.scheduleId),
    staleTime: 10_000,
  });
}

export function useUpdateOrgMeetingSchedule(args: {
  scheduleId: string;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      additionalMessage: string | null;
      additionalMessageVisibility: "both" | "candidate" | "internal";
      attendeeEmails: string[];
      durationMinutes: number;
      expectedVersion: number;
      title: string;
    }) =>
      fetchWithInternalAuth<MeetingScheduleMutationResponse>(
        `/api/org/meeting-schedules/${encodeURIComponent(args.scheduleId)}`,
        {
          body: JSON.stringify({ ...input, workspaceId: args.workspaceId }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        }
      ),
    onSuccess: (payload) => {
      queryClient.setQueryData(
        queryKeys.org.meetingSchedule(args.workspaceId, args.scheduleId),
        payload
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org.meetingSchedule(args.workspaceId, "all"),
      });
    },
  });
}

export function usePrepareOrgMeetingInvitation(args: {
  scheduleId: string;
  workspaceId: string;
}) {
  return useMutation({
    mutationFn: () =>
      fetchWithInternalAuth<MeetingInvitationPreviewResponse>(
        `/api/org/meeting-schedules/${encodeURIComponent(args.scheduleId)}/invitation-preview`,
        {
          body: JSON.stringify({ workspaceId: args.workspaceId }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
  });
}

export function useSendOrgMeetingInvitation(args: {
  scheduleId: string;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      body: string;
      candidateMessage: string | null;
      expectedVersion: number;
      subject: string;
    }) =>
      fetchWithInternalAuth<MeetingScheduleMutationResponse>(
        `/api/org/meeting-schedules/${encodeURIComponent(args.scheduleId)}/send`,
        {
          body: JSON.stringify({ ...input, workspaceId: args.workspaceId }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    onSuccess: (payload) => {
      queryClient.setQueryData(
        queryKeys.org.meetingSchedule(args.workspaceId, args.scheduleId),
        payload
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org.meetingSchedule(args.workspaceId, "all"),
      });
    },
  });
}

export function useRetryOrgMeetingCalendar(args: {
  scheduleId: string;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchWithInternalAuth<MeetingCalendarRetryResponse>(
        `/api/org/meeting-schedules/${encodeURIComponent(args.scheduleId)}/calendar/retry`,
        {
          body: JSON.stringify({ workspaceId: args.workspaceId }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.meetingSchedule(
          args.workspaceId,
          args.scheduleId
        ),
      }),
  });
}
