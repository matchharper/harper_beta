"use client";

import { memo, useEffect, useState } from "react";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { useCareerActionItems } from "@/hooks/career/useCareerActionItems";
import { MuteButton } from "@/components/ui/button";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import {
  useCareerChatActivityContext,
  useCareerChatPanelContext,
} from "./CareerChatPanelContext";
import CareerHomePanel from "./CareerHomePanel";
import CareerHomeDevControls from "./CareerHomeDevControls";
import { CareerActionItemsPanel } from "./CareerActionItemsPanel";
import { CareerOpportunitySummary } from "./CareerOpportunitySummary";
import type { CareerComposerPendingAction } from "@/lib/career/pendingActions";

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

function CareerNextStepsButton({ onOpenChat }: { onOpenChat: () => void }) {
  const t = useCareerT();
  const {
    user,
    conversationId,
    sessionPending,
    profilePending,
    chatAdmissionPending,
    chatPending,
    assistantTyping,
    inputMode,
    isOnboardingDone,
    stage,
    onSendChatMessage,
  } = useCareerChatPanelContext();
  const completed = isOnboardingDone || stage === "completed";

  return (
    <MuteButton
      className="mt-4 w-full"
      size="lg"
      disabled={
        !user ||
        !conversationId ||
        sessionPending ||
        profilePending ||
        chatAdmissionPending ||
        inputMode === "call" ||
        (!completed && (stage === "profile" || chatPending || assistantTyping))
      }
      onClick={() => {
        onOpenChat();
        void onSendChatMessage({
          channel: "chat",
          text: t(
            "career.tasks.suggest_next_steps.message",
            "지금 하면 좋은 일을 알려주세요"
          ),
        });
      }}
    >
      {t("career.tasks.suggest_next_steps.label", "할 일을 알려주세요")}
    </MuteButton>
  );
}

const CareerTasksPanel = memo(function CareerTasksPanel({
  onOpenChat,
  onOpenChatAction,
}: CareerTasksPanelProps) {
  const t = useCareerT();
  const { locale } = useMessages();
  const { isOnboardingDone, stage, workspaceDataLoading } =
    useCareerSidebarContext();
  const actions = useCareerActionItems();
  const { tasksOverride } = useCareerChatActivityContext();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const completed = isOnboardingDone || stage === "completed";
  return (
    <div className="career-followups">
      <header className="career-followups-header">
        <div className="career-followups-date" suppressHydrationWarning>
          {now
            ? new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
                month: "long",
                day: "numeric",
                weekday: "long",
              }).format(now)
            : "\u00a0"}
          {now && (
            <>
              {" "}
              ·{" "}
              {new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
                hour: "numeric",
                minute: "2-digit",
              }).format(now)}
            </>
          )}
        </div>
        <h1>
          {t("career.sky.followups", "지금 팔로업")}
          {!actions.isPending && !actions.isError && (
            <> {actions.data?.length ?? 0}</>
          )}
        </h1>
      </header>
      {completed ? (
        <>
          <CareerActionItemsPanel onOpenChatAction={onOpenChatAction} />
          <CareerOpportunitySummary />
        </>
      ) : !workspaceDataLoading ? (
        <CareerHomePanel variant="onboarding" onOpenChat={onOpenChat} />
      ) : null}
      {tasksOverride === undefined && (
        <CareerHomeDevControls onOpenChat={onOpenChat} />
      )}
      <CareerNextStepsButton onOpenChat={onOpenChat} />
    </div>
  );
});
export default CareerTasksPanel;
