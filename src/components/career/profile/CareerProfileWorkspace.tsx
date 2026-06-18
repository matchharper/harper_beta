import { useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import CareerInPageTabs from "../CareerInPageTabs";
import { useCareerSidebarContext } from "../CareerSidebarContext";
import CareerTalentProfilePanel from "./CareerTalentProfilePanel";
import CareerResumeLinksSettingsSection from "../settings/CareerResumeLinksSettingsSection";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import React from "react";
import { useCareerT } from "@/i18n/useCareerT";

type ProfileSectionId = "profile" | "links";

const isProfileSectionId = (
  value: string | null | undefined
): value is ProfileSectionId => value === "profile" || value === "links";

type ProfileSectionItem = {
  id: ProfileSectionId;
  label: string;
  title: string;
  description: string[];
};

const getProfileSectionItems = (
  t: ReturnType<typeof useCareerT>
): ProfileSectionItem[] => [
  {
    id: "profile",
    label: t("career.common.career_workspace_screen.0b0v9cr", "프로필"),
    title: t("career.common.career_workspace_screen.0b0v9cr", "프로필"),
    description: [
      t(
        "career.profile.career_profile_workspace.16e35ps",
        "입력하신 정보와 대화내용을 바탕으로 Harper가 구성한 프로필입니다."
      ),
      t(
        "career.profile.career_profile_workspace.116ofw4",
        "이대로 회사 측에 전달되지는 않지만, 변경하고 싶으신 사항이 있는지 확인할 수 있습니다."
      ),
    ],
  },
  {
    id: "links",
    label: t("career.profile.career_profile_workspace.14bifvm", "이력서/링크"),
    title: t("career.profile.career_profile_workspace.14bifvm", "이력서/링크"),
    description: [
      t(
        "career.profile.career_profile_workspace.11os0vs",
        "이력서와 나와 관련된 링크를 확인하고 수정할 수 있습니다."
      ),
    ],
  },
];

const CareerProfileWorkspace = () => {
  const t = useCareerT();
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const { savedResumeFileName, savedResumeStoragePath } =
    useCareerSidebarContext();
  const hasSavedResume = Boolean(savedResumeFileName || savedResumeStoragePath);

  const sectionItems = useMemo(
    () =>
      getProfileSectionItems(t).map((item) =>
        item.id === "links"
          ? {
              ...item,
              attention: !hasSavedResume,
              attentionLabel: t(
                "career.profile.career_profile_workspace.0pv1jmq",
                "저장된 이력서가 없습니다"
              ),
            }
          : item
      ),
    [hasSavedResume, t]
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
