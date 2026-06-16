import { showToast } from "@/components/toast/toast";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

export function showOpportunityDiscoveryStartedToast(
  message: string = H.opportunityDiscoveryStarted
) {
  showToast({
    message,
    variant: "white",
  });
}
