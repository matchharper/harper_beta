import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import CareerInPageTabs from "../CareerInPageTabs";
import CareerTalentProfilePanel from "./CareerTalentProfilePanel";
import CareerResumeLinksSettingsSection from "../settings/CareerResumeLinksSettingsSection";
import React from "react";

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
    label: "프로필",
    title: "프로필",
    description: [
      "입력하신 정보와 대화내용을 바탕으로 Harper가 구성한 프로필입니다.",
      "이대로 회사 측에 전달되지는 않지만, 변경하고 싶으신 사항이 있는지 확인할 수 있습니다.",
    ],
  },
  {
    id: "links",
    label: "이력서/링크",
    title: "이력서/링크",
    description: ["이력서와 나와 관련된 링크를 확인하고 수정할 수 있습니다."],
  },
];

const CareerProfileWorkspace = () => {
  const router = useRouter();
  const [activeSection, setActiveSection] =
    useState<ProfileSectionId>("profile");
  const requestedSection = useMemo(() => {
    const raw =
      typeof router.query.profileSection === "string"
        ? router.query.profileSection
        : null;
    return isProfileSectionId(raw) ? raw : null;
  }, [router.query.profileSection]);

  useEffect(() => {
    if (!router.isReady || !requestedSection) return;
    setActiveSection(requestedSection);
  }, [requestedSection, router.isReady]);

  const tabs = useMemo(() => PROFILE_SECTION_ITEMS, []);

  const activeContent = useMemo(() => {
    if (activeSection === "links") {
      return <CareerResumeLinksSettingsSection />;
    }

    return <CareerTalentProfilePanel />;
  }, [activeSection]);

  return (
    <>
      <div className="my-4">
        <CareerInPageTabs
          items={tabs}
          activeId={activeSection}
          onChange={setActiveSection}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="w-full">{activeContent}</div>
      </div>
    </>
  );
};

export default React.memo(CareerProfileWorkspace);
