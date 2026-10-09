import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import {
  useCareerPendingActionsSnapshot,
  useCareerTaskProgress,
} from "./useCareerPendingActions";
import { isCareerDecisionAction } from "@/lib/career/taskItems";
import { useMessages } from "@/i18n/useMessage";

export function useCareerTasks(includeProgress = false) {
  const { user, isOnboardingDone, stage } = useCareerSidebarContext();
  const { locale } = useMessages();
  const { pendingActionsOverride, tasksOverride } = useCareerChatPanelContext();
  const overridden =
    tasksOverride !== undefined || pendingActionsOverride !== undefined;
  const enabled = !overridden && (isOnboardingDone || stage === "completed");
  const args = { enabled, userId: user?.id, locale };
  const pending = useCareerPendingActionsSnapshot(args);
  const progress = useCareerTaskProgress({
    ...args,
    enabled: enabled && includeProgress,
  });
  const actions =
    tasksOverride?.actions ??
    pendingActionsOverride ??
    pending.data?.actions ??
    [];
  const meetingSchedules =
    tasksOverride?.meetingSchedules ?? pending.data?.meetingSchedules ?? [];
  const decisions = actions.filter(isCareerDecisionAction);

  return {
    actions,
    connections: tasksOverride?.connections ?? progress.data?.connections ?? [],
    priorityReviews: tasksOverride?.priorityReviews ?? progress.data?.priorityReviews ?? [],
    decisionCount: decisions.length + meetingSchedules.length,
    decisions,
    error:
      !overridden &&
      (pending.isError || Boolean(pending.data?.unavailableCategories.length)),
    loading: enabled && pending.isPending,
    meetingSchedules,
    progressError: enabled && includeProgress && progress.isError,
    progressLoading: enabled && includeProgress && progress.isPending,
    searchStatus:
      tasksOverride?.searchStatus ?? progress.data?.searchStatus ?? null,
    suggestions: actions.filter((action) => !isCareerDecisionAction(action)),
    refetch: () => {
      void pending.refetch();
      if (includeProgress) void progress.refetch();
    },
  };
}
