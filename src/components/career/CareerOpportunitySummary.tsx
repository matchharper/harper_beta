"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Typography } from "@/components/ui/typography";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerHistoryContext } from "./CareerSidebarContext";

export function CareerOpportunitySummary() {
  const t = useCareerT();
  const { historyOpportunityCounts, historyLoading } =
    useCareerHistoryContext();
  const { saved, applied, connected } = historyOpportunityCounts.savedStages;
  const stats = [
    {
      key: "saved",
      label: t(
        "career.common.career_history_panel.saved_positions_tab",
        "저장함"
      ),
      count: saved,
    },
    {
      key: "applied",
      label: t("career.history.saved_opportunity_status.applied", "지원함"),
      count: applied,
    },
    {
      key: "connected",
      label: t("career.history.saved_opportunity_status.connected", "진행중"),
      count: connected,
    },
  ];

  return (
    <Card
      className="mt-3 max-w-[440px] rounded-2xl p-5 shadow-none"
      data-career-opportunity-summary
    >
      <Typography as="h2" variant="description" className="mb-4">
        {t("career.tasks.opportunity_summary.title", "지원 현황")}
      </Typography>
      <dl className="grid grid-cols-3 gap-4" aria-busy={historyLoading}>
        {stats.map(({ key, label, count }) => (
          <div key={key} className="flex min-w-0 flex-col">
            <Typography asChild variant="description" className="order-2 mt-1">
              <dt>{label}</dt>
            </Typography>
            <Typography
              asChild
              variant="metric-lg"
              className="order-1 font-light"
            >
              <dd>
                {historyLoading ? (
                  <Skeleton className="h-10 w-12" />
                ) : (
                  count.toLocaleString()
                )}
              </dd>
            </Typography>
          </div>
        ))}
      </dl>
    </Card>
  );
}
