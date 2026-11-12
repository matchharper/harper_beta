import { useCareerSidebarContext } from "./CareerSidebarContext";
import {
  useCareerCallContext,
  useCareerChatActivityContext,
} from "./CareerChatPanelContext";

export function useCareerCheckpointBusy() {
  const workspace = useCareerSidebarContext();
  const call = useCareerCallContext();
  const chat = useCareerChatActivityContext();
  return (
    chat.chatPending ||
    chat.chatAdmissionPending ||
    chat.assistantTyping ||
    workspace.currentDataJobPostingRecommendationTestPending ||
    workspace.callStartPending ||
    workspace.opportunityRunTriggerPending ||
    workspace.sessionReengagementTestPending ||
    workspace.onboardingCompletionTestPending ||
    call.callConnectionStatus === "connected" ||
    call.callConnectionStatus === "reconnecting"
  );
}
