import { useQuery } from "@tanstack/react-query";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "@/components/career/CareerSidebarContext";
import type { CareerExternalFeedbackSnapshot } from "@/lib/career/taskItems";
import {
  countCareerProfileLinks,
  getCareerProfileSourceSuggestion,
} from "@/lib/career/profileSources";
import { useCareerApi } from "./useCareerApi";
import { useGmailIntegration } from "./useGmailIntegration";

export const careerExternalFeedbackQueryKey = (userId: string | null) =>
  ["career-task-external-feedback", userId] as const;

// Mounted only inside Tasks. Each suggestion can settle independently of the
// workspace bootstrap, pending actions, and the full opportunity history.
export function useCareerTaskSuggestions() {
  const { fetchWithAuth } = useCareerApi();
  const { user, workspaceDataLoading } = useCareerSidebarContext();
  const { savedProfileLinks } = useCareerProfileContext();
  const { sessionPending, profilePending, profileError, tasksOverride } =
    useCareerChatPanelContext();
  const overridden = tasksOverride !== undefined;
  const enabled = Boolean(user) && !overridden;
  const externalQuery = useQuery({
    enabled: enabled && !sessionPending,
    queryKey: careerExternalFeedbackQueryKey(user?.id ?? null),
    queryFn: async (): Promise<CareerExternalFeedbackSnapshot> => {
      const response = await fetchWithAuth(
        "/api/talent/pending-actions?scope=external-feedback"
      );
      if (!response.ok)
        throw new Error("Failed to load external feedback suggestions");
      return response.json();
    },
    staleTime: 30_000,
  });

  const profileLoading =
    sessionPending || profilePending || workspaceDataLoading;
  const needsGmailStatus = countCareerProfileLinks(savedProfileLinks) <= 1;
  const gmailEnabled =
    enabled && needsGmailStatus && !profileLoading && !profileError;
  const gmail = useGmailIntegration(user?.id ?? null, {
    enabled: gmailEnabled,
  });
  const gmailConnected = overridden
    ? tasksOverride.gmailConnected === true
    : gmail.status === "active";
  const sourcesLoading =
    Boolean(user) &&
    !overridden &&
    (profileLoading || (gmailEnabled && gmail.status === "loading"));
  const sourcesError =
    Boolean(user) &&
    !overridden &&
    (Boolean(profileError) || (gmailEnabled && gmail.status === "error"));

  return {
    externalFeedback: overridden
      ? (tasksOverride.externalFeedback ?? [])
      : (externalQuery.data?.externalFeedback ?? []),
    externalLoading: enabled && externalQuery.isPending,
    externalError: enabled && externalQuery.isError,
    retryExternal: () => {
      void externalQuery.refetch();
    },
    sourcesLoading,
    sourcesError,
    sourceSuggestion:
      !user || sourcesLoading || sourcesError
        ? null
        : getCareerProfileSourceSuggestion(savedProfileLinks, gmailConnected),
  };
}
