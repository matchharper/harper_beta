"use client";

import { Archive } from "lucide-react";
import type { ReactNode } from "react";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import { Badge } from "@/components/ui/badge";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import { getMyOpportunityTabs } from "./savedOpportunityStatus";

type OpportunityTab = "new" | "applied" | "saved" | "hidden" | "archived";

export default function CareerOpportunityTabs({
  activeTab,
  counts,
  onChange,
  actions,
  className,
}: {
  activeTab: string;
  counts: Partial<Record<OpportunityTab, number>>;
  onChange: (tab: OpportunityTab) => void;
  actions?: ReactNode;
  className?: string;
}) {
  const t = useCareerT();
  const primaryItems: TabBoxItem<OpportunityTab>[] = [
    {
      id: "new" as const,
      label: t("career.common.career_history_panel.02i826z", "새 기회"),
    },
    ...getMyOpportunityTabs(t).filter(({ id }) => id !== "hidden"),
  ].map(({ id, label }) => ({
    value: id,
    label,
    count: id === "new" || id === "applied" ? undefined : counts[id],
    countLabel:
      (id === "new" || id === "applied") && (counts[id] ?? 0) > 0 ? (
        <Badge variant="count" size="xs" radius="full">
          {counts[id]}
        </Badge>
      ) : undefined,
  }));
  const secondaryItems: TabBoxItem<OpportunityTab>[] = [
    ...getMyOpportunityTabs(t)
      .filter(({ id }) => id === "hidden")
      .map(({ id, label }) => ({ value: id, label })),
    {
      value: "archived",
      label: (
        <>
          <Archive aria-hidden="true" />
          <span className="sr-only">
            {t(
              "career.history.saved_opportunity_status.archived",
              "숨긴 포지션"
            )}
          </span>
        </>
      ),
    },
  ];

  return (
    <div className={cn("career-opportunity-tabs flex min-w-0 items-center gap-2", className)}>
      <TabBoxes<OpportunityTab>
        activeValue={activeTab as OpportunityTab}
        items={primaryItems}
        onValueChange={onChange}
        size="lg"
        variant="neutral"
        className="min-w-0 flex-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      />
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <TabBoxes<OpportunityTab>
          activeValue={activeTab as OpportunityTab}
          items={secondaryItems}
          onValueChange={onChange}
          size="lg"
          variant="neutral"
          className="w-auto shrink-0"
          getItemClassName={({ value }) =>
            value === "archived" ? "w-8 px-0" : ""
          }
        />
      </div>
    </div>
  );
}
