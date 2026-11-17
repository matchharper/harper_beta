"use client";

import { Archive } from "lucide-react";
import type { ReactNode } from "react";
import { TabBoxes } from "@/components/ui/tab-boxes";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { cn } from "@/lib/utils";
import { getMyOpportunityTabs } from "./savedOpportunityStatus";

type OpportunityTab = "new" | "applied" | "saved" | "hidden" | "archived";
type Group = "new" | "mine" | "archived";

export default function CareerOpportunityTabs({
  activeTab,
  counts,
  onChange,
  actions,
  className,
}: {
  activeTab: string;
  counts?: { new?: number; saved?: number; applied: number; hidden: number };
  onChange: (tab: OpportunityTab) => void;
  actions?: ReactNode;
  className?: string;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const mineCount =
    counts?.saved === undefined
      ? undefined
      : counts.saved + counts.applied + counts.hidden;
  const group =
    activeTab === "new" || activeTab === "archived" ? activeTab : "mine";
  const title = t("career.workspace.opportunities", "기회");
  const mine = t("career.workspace.my_opportunities", "내 기회");
  const archived = t(
    "career.history.saved_opportunity_status.archived",
    "숨긴 포지션"
  );

  return (
    <div className={cn("mb-4 min-w-0", className)}>
      <header className="career-panel-heading flex-wrap">
        <div className="flex items-center gap-2">
          <h1>{title}</h1>
          {group !== "mine" && actions}
        </div>
        <TabBoxes<Group>
          aria-label={title}
          className="ms-auto w-auto max-w-full"
          variant="text"
          activeValue={group}
          items={[
            {
              value: "new",
              label: t("career.common.career_history_panel.02i826z", "새 기회"),
              count: counts?.new?.toLocaleString(locale) ?? "–",
            },
            {
              value: "mine",
              label: mine,
              count: mineCount?.toLocaleString(locale) ?? "–",
            },
            {
              value: "archived",
              label: (
                <span title={archived}>
                  <Archive aria-hidden className="size-[18px]" />
                  <span className="sr-only">{archived}</span>
                </span>
              ),
            },
          ]}
          onValueChange={(value) => {
            if (value !== group) onChange(value === "mine" ? "saved" : value);
          }}
        />
      </header>
      <div className="flex items-center justify-end gap-2">
        {group === "mine" && (
          <TabBoxes<OpportunityTab>
            aria-label={mine}
            variant="neutral"
            activeValue={activeTab as OpportunityTab}
            items={getMyOpportunityTabs(t).map(({ id, label }) => ({
              value: id,
              label,
              count: counts?.[id] || undefined,
            }))}
            onValueChange={onChange}
          />
        )}
        {group === "mine" && actions}
      </div>
    </div>
  );
}
