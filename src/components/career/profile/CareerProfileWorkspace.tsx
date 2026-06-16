import { useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import CareerInPageTabs from "../CareerInPageTabs";
import { useCareerSidebarContext } from "../CareerSidebarContext";
import CareerTalentProfilePanel from "./CareerTalentProfilePanel";
import CareerResumeLinksSettingsSection from "../settings/CareerResumeLinksSettingsSection";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import React from "react";
import { careerT } from "@/lib/career/translatedCareerMessage";

type ProfileSectionId = "profile" | "links";

const isProfileSectionId = (
  value: string | null | undefined
): value is ProfileSectionId => value === "profile" || value === "links";

const PROFILE_SECTION_ITEMS: Array<{
  id: ProfileSectionId;
  label: string;
  title: string;
  description: string[];
}> = [
  {
    id: "profile",
    label: careerT(
      "ko",
      "career.common.career_workspace_screen.0b0v9cr",
      "프로필"
    ),
    title: careerT(
      "ko",
      "career.common.career_workspace_screen.0b0v9cr",
      "프로필"
    ),
    description: [
      careerT(
        "ko",
        "career.profile.career_profile_workspace.16e35ps",
        "입력하신 정보와 대화내용을 바탕으로 Harper가 구성한 프로필입니다."
      ),
      careerT(
        "ko",
        "career.profile.career_profile_workspace.116ofw4",
        "이대로 회사 측에 전달되지는 않지만, 변경하고 싶으신 사항이 있는지 확인할 수 있습니다."
      ),
    ],
  },
  {
    id: "links",
    label: careerT(
      "ko",
      "career.profile.career_profile_workspace.14bifvm",
      "이력서/링크"
    ),
    title: careerT(
      "ko",
      "career.profile.career_profile_workspace.14bifvm",
      "이력서/링크"
    ),
    description: [
      careerT(
        "ko",
        "career.profile.career_profile_workspace.11os0vs",
        "이력서와 나와 관련된 링크를 확인하고 수정할 수 있습니다."
      ),
    ],
  },
];

const CareerProfileWorkspace = () => {
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const { savedResumeFileName, savedResumeStoragePath } =
    useCareerSidebarContext();
  const hasSavedResume = Boolean(savedResumeFileName || savedResumeStoragePath);

  const sectionItems = useMemo(
    () =>
      PROFILE_SECTION_ITEMS.map((item) =>
        item.id === "links"
          ? {
              ...item,
              attention: !hasSavedResume,
              attentionLabel: careerT(
                "ko",
                "career.profile.career_profile_workspace.0pv1jmq",
                "저장된 이력서가 없습니다"
              ),
            }
          : item
      ),
    [hasSavedResume]
  );

  const activeSection: ProfileSectionId = useMemo(() => {
    const raw = router.query.profileSection;
    return typeof raw === "string" && isProfileSectionId(raw) ? raw : "profile";
  }, [router.query.profileSection]);

  const handleChangeSection = useCallback(
    (next: ProfileSectionId) => {
      logCareerEvent(`click_profile_section_${next}`);
      void router.replace(
        {
          pathname: router.pathname,
          query: { ...router.query, profileSection: next },
        },
        undefined,
        { shallow: true }
      );
    },
    [logCareerEvent, router]
  );

  const activeContent =
    activeSection === "links" ? (
      <CareerResumeLinksSettingsSection />
    ) : (
      <CareerTalentProfilePanel />
    );

  return (
    <>
      <CareerInPageTabs
        items={sectionItems}
        activeId={activeSection}
        onChange={handleChangeSection}
        mobileFloating
        className="md:my-4"
      />

      <div className="flex flex-col gap-4">
        <div className="w-full">{activeContent}</div>
      </div>
    </>
  );
};

export default React.memo(CareerProfileWorkspace);
