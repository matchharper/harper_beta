import { Handshake, ListChecks, ScanSearch, Users } from "lucide-react";
import {
  OnboardingGuideBody,
  OnboardingGuideHeader,
} from "@/components/common/onboarding/OnboardingGuide";
import type { OnboardingStepDefinition } from "@/components/common/onboarding/Onboarding";
import { useCareerT } from "@/i18n/useCareerT";

export const getCareerOnboardingGuideDefinition = (
  t: ReturnType<typeof useCareerT>
): OnboardingStepDefinition => ({
  label: t("career.onboarding.guide.label", "Harper 활용하기"),
  title: [
    t("career.onboarding.guide.title", "Harper에게 이런 걸 요청할 수 있어요."),
  ],
  description: [],
  headerClassName: "",
  titleClassName: "",
  descriptionClassName: "",
  bodyClassName: "",
});

export function CareerOnboardingGuideHeader() {
  const t = useCareerT();
  return (
    <OnboardingGuideHeader
      title={getCareerOnboardingGuideDefinition(t).title.join(" ")}
    />
  );
}

// The onboarding flow and preview share this content. Edit the three items here.
export function CareerOnboardingGuideBody() {
  const t = useCareerT();
  return (
    <OnboardingGuideBody
      items={[
        {
          id: "discover",
          icon: Users,
          title: t(
            "career.onboarding.guide.discover_title",
            "Harper는 회사와 직접 연결해드려요."
          ),
          description: t(
            "career.onboarding.guide.discover_description",
            "Harper는 직접 연결가능한 네트워크가 있어요. 이 네트워크 안에서 적절한 인재와 회사를 연결해요."
          ),
        },
        {
          id: "prepare",
          icon: ScanSearch,
          title: t(
            "career.onboarding.guide.prepare_title",
            "밖의 모든 기회를 항상 탐색해요."
          ),
          description: t(
            "career.onboarding.guide.prepare_description",
            "앞으로는 일에만 집중하고 계세요. 제가 항상 좋은 기회를 찾아서 알려드릴게요."
          ),
        },
        {
          id: "track",
          icon: ListChecks,
          title: t(
            "career.onboarding.guide.track_title",
            "모든 필요한 작업을 맡겨주세요."
          ),
          description: t(
            "career.onboarding.guide.track_description",
            "관심을 가지실만한 회사를 항상 팔로우하고, 원하실 때 대신 이력서 보강부터 지원까지 해요."
          ),
        },
      ]}
    />
  );
}
