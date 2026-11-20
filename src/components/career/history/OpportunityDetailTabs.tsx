import { useId, useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/tabs";
import { useCareerT } from "@/i18n/useCareerT";

export default function OpportunityDetailTabs({
  activity,
  opportunity,
  company,
}: {
  activity: ReactNode;
  opportunity: ReactNode;
  company: ReactNode;
}) {
  const t = useCareerT();
  const [selected, setSelected] = useState("activity");
  const id = useId();
  const sections = [
    {
      value: "activity",
      label: t("career.history.talent_role_activity_timeline.title", "내 활동"),
      body: activity,
    },
    {
      value: "opportunity",
      label: t("career.history.detail.opportunity_info", "기회 정보"),
      body: opportunity,
    },
    {
      value: "company",
      label: t("career.common.career.0ol21b2", "회사 정보"),
      body: company,
    },
  ];
  return (
    <div className="min-w-0">
      <Tabs
        id={id}
        animateIndicator
        activeValue={selected}
        onValueChange={setSelected}
        items={sections}
        size="medium"
        className="gap-5 sm:gap-8"
      />
      {sections.map(({ value, body }) => (
        <div
          key={value}
          role="tabpanel"
          aria-labelledby={id + "-" + value}
          id={id + "-panel-" + value}
          hidden={selected !== value}
          className="min-w-0 pt-4 sm:pt-5"
        >
          {(value === "activity" || selected === value) && body}
        </div>
      ))}
    </div>
  );
}
