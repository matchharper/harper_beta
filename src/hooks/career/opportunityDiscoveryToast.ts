import { showToast } from "@/components/toast/toast";

export function showOpportunityDiscoveryStartedToast() {
  showToast({
    message: "기회 검색을 시작했습니다.",
    variant: "white",
  });
}
