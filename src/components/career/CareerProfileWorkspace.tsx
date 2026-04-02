import { useMemo, useState } from "react";
import CareerHarperInsightsSection from "./CareerHarperInsightsSection";
import CareerInPageTabs from "./CareerInPageTabs";
import CareerProfileSettingsSection from "./CareerProfileSettingsSection";
import CareerTalentProfilePanel from "./CareerTalentProfilePanel";
import CareerVisibilitySettingsSection from "./settings/CareerVisibilitySettingsSection";
import CareerResumeLinksSettingsSection from "./settings/CareerResumeLinksSettingsSection";

type ProfileSectionId = "setting" | "profile" | "insight" | "links";

const PROFILE_SECTION_ITEMS: Array<{
  id: ProfileSectionId;
  label: string;
}> = [
  { id: "setting", label: "Setting" },
  { id: "profile", label: "Profile" },
  { id: "insight", label: "Harper's insight" },
  { id: "links", label: "Links" },
];

const CareerProfileWorkspace = () => {
  const [activeSection, setActiveSection] =
    useState<ProfileSectionId>("setting");
  const tabs = useMemo(() => PROFILE_SECTION_ITEMS, []);

  const activeContent = useMemo(() => {
    if (activeSection === "setting") {
      return (
        <div className="space-y-4">
          <CareerProfileSettingsSection />
          <CareerVisibilitySettingsSection />
        </div>
      );
    }

    if (activeSection === "profile") {
      return <CareerTalentProfilePanel showManageButton={false} />;
    }

    if (activeSection === "insight") {
      return <CareerHarperInsightsSection />;
    }

    return <CareerResumeLinksSettingsSection />;
  }, [activeSection]);

  return (
    <>
      <div className="sticky top-12 z-20 px-5">
        <CareerInPageTabs
          items={tabs}
          activeId={activeSection}
          onChange={setActiveSection}
        />
      </div>

      <div className="px-5 py-5">{activeContent}</div>
    </>
  );
};

export default CareerProfileWorkspace;
