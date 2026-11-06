"use client";

import { Card } from "@/components/ui/card";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Typography } from "@/components/ui/typography";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerHistoryContext } from "./CareerSidebarContext";
import { useCareerWorkspaceNavigation } from "./CareerWorkspaceNavigationContext";

export function CareerOpportunitySummary() {
  const t = useCareerT();
  const navigation = useCareerWorkspaceNavigation();
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
  ] as const;

  return (
    <Card
      className="career-summary career-glass"
      data-career-opportunity-summary
    >
      <Typography as="h2" variant="description" className="mb-8">
        {t("career.tasks.opportunity_summary.title", "지원 현황")}
      </Typography>
      <dl className="grid grid-cols-3 gap-4" aria-busy={historyLoading}>
        {stats.map(({ key, label, count }) => (
          <ClickablePanel
            key={key}
            className="flex min-w-0 rounded-md flex-col cursor-pointer transition-colors hover:bg-interaction-hover"
            disabled={!navigation}
            onActivate={() =>
              navigation?.navigate("history", {
                historyTarget: { historyTab: "saved", savedStage: key },
              })
            }
          >
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
          </ClickablePanel>
        ))}
      </dl>
    </Card>
  );
}
