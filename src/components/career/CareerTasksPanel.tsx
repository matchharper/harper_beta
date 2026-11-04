"use client";

import { memo } from "react";
import { useCareerT } from "@/i18n/useCareerT";
import { Typography } from "@/components/ui/typography";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerHomePanel from "./CareerHomePanel";
import CareerHomeDevControls from "./CareerHomeDevControls";
import CareerWelcomeHeader from "./CareerWelcomeHeader";
import { CareerActionItemsPanel } from "./CareerActionItemsPanel";
import { CareerOpportunitySummary } from "./CareerOpportunitySummary";
import type { CareerComposerPendingAction } from "@/lib/career/pendingActions";

// Keep navigation props compatible with the existing desktop/mobile workspace.
type CareerTasksPanelProps = {
  onOpenChat: () => void;
  onOpenChatAction: (action: CareerComposerPendingAction) => void;
  onOpenOpportunity: (
    roleId: string,
    historyTab: "new" | "saved",
    savedStage?: "connected" | "closed"
  ) => void;
  onOpenProfile: () => void;
  showTitle?: boolean;
};

const CareerTasksPanel = memo(function CareerTasksPanel({
  onOpenChat,
  onOpenChatAction,
  showTitle = true,
}: CareerTasksPanelProps) {
  const t = useCareerT();
  const { isOnboardingDone, stage, workspaceDataLoading } =
    useCareerSidebarContext();
  const completed = isOnboardingDone || stage === "completed";
  return (
    <div className="mx-auto w-full max-w-2xl py-7 text-neutral-primary">
      <div className="mb-8 hidden lg:block">
        <CareerWelcomeHeader align="left" />
      </div>
      {showTitle && (
        <Typography as="h1" variant="page-title" className="mb-6">
          {t("career.tasks.title", "할 일")}
        </Typography>
      )}
      {completed ? (
        <>
          <CareerActionItemsPanel onOpenChatAction={onOpenChatAction} />
          <CareerOpportunitySummary />
        </>
      ) : !workspaceDataLoading ? (
        <CareerHomePanel variant="onboarding" onOpenChat={onOpenChat} />
      ) : null}
      <CareerHomeDevControls onOpenChat={onOpenChat} />
    </div>
  );
});
export default CareerTasksPanel;
