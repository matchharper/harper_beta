import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import CareerHarperInsightsSection from "./CareerHarperInsightsSection";
import CareerInPageTabs from "../CareerInPageTabs";
import CareerProfileSettingsSection from "../CareerProfileSettingsSection";
import CareerTalentProfilePanel from "./CareerTalentProfilePanel";
import CareerResumeLinksSettingsSection from "../settings/CareerResumeLinksSettingsSection";
import React from "react";

type ProfileSectionId = "preference" | "profile" | "insight" | "links";

const isProfileSectionId = (
  value: string | null | undefined
): value is ProfileSectionId =>
  value === "preference" ||
  value === "profile" ||
  value === "insight" ||
  value === "links";

const PROFILE_SECTION_ITEMS: Array<{
  id: ProfileSectionId;
  label: string;
  title: string;
  description: string[];
}> = [
  {
    id: "preference",
    label: "선호 조건",
    title: "현재 상태 설정",
    description: ["선호하는 기회 혹은 현재 상태를 설정합니다."],
  },
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
    id: "insight",
    label: "하퍼 인사이트",
    title: "기회 탐색 조건",
    description: [
      "Harper가 대화 혹은 프로필을 바탕으로 어떤 기회를 주로 매칭할지에 대해 저장한 정보입니다.",
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
    useState<ProfileSectionId>("preference");
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

  const tabs = useMemo(
    () => PROFILE_SECTION_ITEMS.filter((item) => item.id !== "insight"),
    []
  );

  const activeContent = useMemo(() => {
    if (activeSection === "preference") {
      return <CareerProfileSettingsSection />;
    }

    if (activeSection === "profile") {
      return <CareerTalentProfilePanel />;
    }

    if (activeSection === "insight") {
      return <CareerHarperInsightsSection />;
    }

    return <CareerResumeLinksSettingsSection />;
  }, [activeSection]);

  const title = useMemo(() => {
    return tabs.find((tab) => tab.id === activeSection)?.title ?? "";
  }, [activeSection, tabs]);

  const description = useMemo(() => {
    return tabs.find((tab) => tab.id === activeSection)?.description ?? [];
  }, [activeSection, tabs]);

  return (
    <>
      <div className="sticky top-0 z-20 backdrop-blur">
        <CareerInPageTabs
          items={tabs}
          activeId={activeSection}
          onChange={setActiveSection}
        />
      </div>

      <div className="flex flex-col gap-4 py-0 mt-6">
        {/* <div className="flex flex-col gap-2">
          <h3 className="text-lg font-medium leading-5">{title}</h3>
          {description.map((item, index) => (
            <p key={index} className="mt-1 text-sm text-black/70 font-normal">
              {item}
            </p>
          ))}
        </div> */}
        <div className="w-full">{activeContent}</div>
      </div>
    </>
  );
};

export default React.memo(CareerProfileWorkspace);
