import { GalleryVerticalEnd, House, Loader2, User } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import CareerChatPanel from "@/components/career/CareerChatPanel";
import CareerHistoryPanel from "@/components/career/CareerHistoryPanel";
import CareerHomePanel from "@/components/career/CareerHomePanel";
import CareerProfileWorkspace from "@/components/career/profile/CareerProfileWorkspace";
import CareerCompanyWatchlistPanel from "@/components/career/watchlist/CareerCompanyWatchlistPanel";
import CareerCompanyDetailDrawer from "@/components/career/watchlist/CareerCompanyDetailDrawer";
import CareerSupportInquiryModal from "@/components/career/CareerSupportInquiryModal";
import HistoryOpportunityInfoModal from "@/components/career/history/HistoryOppotunityInfoModal";
import { HistoryMemoModal } from "@/components/career/history/FeedbackModal";
import InternalConnectionOnboardingModal, {
  shouldBlockInternalConnectionAcceptance,
} from "@/components/career/InternalConnectionOnboardingModal";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import CareerWorkspaceNav, {
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { careerCx } from "@/components/career/ui/CareerPrimitives";
import { CareerActionButton } from "@/components/career/ui/CareerActionButton";
import CareerMobileJobsView, {
  JobActionBar,
} from "@/components/career/mobile/jobs/CareerMobileJobsView";
import CareerMobileChatLauncher from "@/components/career/mobile/CareerMobileChatLauncher";
import CareerMobileHomeView from "@/components/career/mobile/CareerMobileHomeView";
import CareerMobileShell from "@/components/career/mobile/CareerMobileShell";
import CareerMobileTopBar from "@/components/career/mobile/CareerMobileTopBar";
import { useIsMobile, useMediaQuery } from "@/hooks/useMediaQuery";
import { useResizableSplitPanel } from "@/hooks/useResizableSplitPanel";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import {
  useCareerMobileHistoryOpportunities,
  type CareerMobileHistoryJobsTab,
} from "@/hooks/career/useCareerMobileHistoryOpportunities";
import type {
  CareerHistoryOpportunity,
  CareerOpportunityType,
} from "@/components/career/types";
import { AnimatePresence, motion } from "motion/react";
import React from "react";

type JobsDisplayTab = CareerMobileHistoryJobsTab;

type CareerWorkspaceHistoryTarget = {
  historyTab: "new" | "saved" | "archived";
  savedStage?: "saved" | "applied" | "connected" | "closed";
};

type CareerWorkspaceNavigationOptions = {
  historyTarget?: CareerWorkspaceHistoryTarget;
};

const DESKTOP_MEDIA_QUERY = "(min-width: 720px)";
const CHAT_PANEL_MIN_WIDTH = 34;
const CHAT_PANEL_MAX_WIDTH = 62;
const CHAT_PANEL_DEFAULT_WIDTH = 52;
const CHAT_PANEL_RESIZE_HANDLE_WIDTH_PX = 8;

export const NAV_ITEMS: Array<{
  id: CareerWorkspaceTab;
  label: string;
  icon: typeof House;
}> = [
  {
    id: "home",
    label: "홈",
    icon: House,
  },
  {
    id: "history",
    label: "포지션",
    icon: GalleryVerticalEnd,
  },
  // Watchlist is hidden for the deploy until the tab is ready.
  {
    id: "profile",
    label: "프로필",
    icon: User,
  },
];

const CareerCanvas = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={careerCx("min-w-0 px-4", className)}>{children}</section>
);

const CareerWorkspaceContent = ({
  activeTab,
  onChangeTab,
  onRequestChatFocus,
}: {
  activeTab: CareerWorkspaceTab;
  onChangeTab: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
  onRequestChatFocus: () => void;
}) => {
  if (activeTab === "home") {
    return (
      <CareerCanvas>
        <CareerHomePanel
          onOpenChat={onRequestChatFocus}
          onOpenHistory={(historyTarget) =>
            onChangeTab("history", { historyTarget })
          }
          onOpenProfile={() => onChangeTab("profile")}
        />
      </CareerCanvas>
    );
  }

  if (activeTab === "history") {
    return (
      <CareerCanvas className="min-h-full">
        <CareerHistoryPanel />
      </CareerCanvas>
    );
  }

  if (activeTab === "watchlist") {
    return (
      <CareerCanvas className="min-h-full">
        <CareerCompanyWatchlistPanel />
      </CareerCanvas>
    );
  }

  return (
    <CareerCanvas>
      <CareerProfileWorkspace />
    </CareerCanvas>
  );
};

export const CareerWorkspace = () => {
  return <CareerWorkspaceRoot />;
};

export const CareerLoadingState = () => (
  <main className="relative flex min-h-svh w-full items-center justify-center bg-hblack000 font-geist text-hblack900">
    <Loader2 className="h-5 w-5 animate-spin text-hblack400" />
    <span className="sr-only">커리어 페이지 로딩 중</span>
  </main>
);

const CareerWorkspaceScreen = ({
  activeTab,
  onChangeTab,
  children,
}: {
  activeTab?: CareerWorkspaceTab;
  children?: React.ReactNode;
  onChangeTab?: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
}) => (
  <main className="relative min-h-svh w-full bg-beige50 font-geist text-beige900">
    {children ?? (
      <CareerWorkspaceRoot activeTab={activeTab} onChangeTab={onChangeTab} />
    )}
  </main>
);

export default React.memo(CareerWorkspaceScreen);

const CareerWorkspaceRoot = ({
  activeTab: controlledActiveTab,
  onChangeTab: controlledOnChangeTab,
}: {
  activeTab?: CareerWorkspaceTab;
  onChangeTab?: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
}) => {
  const [activeTabState, setActiveTabState] =
    useState<CareerWorkspaceTab>("home");
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const {
    containerRef: workspaceRef,
    widthPct: chatPanelWidth,
    handleResizeStart,
    handleResizeKeyDown,
  } = useResizableSplitPanel({
    enabled: isDesktop,
    minPct: CHAT_PANEL_MIN_WIDTH,
    maxPct: CHAT_PANEL_MAX_WIDTH,
    defaultPct: CHAT_PANEL_DEFAULT_WIDTH,
  });
  const { historyOpportunities } = useCareerSidebarContext();
  const activeTab = controlledActiveTab ?? activeTabState;
  const handleChangeTab =
    controlledOnChangeTab ??
    ((nextTab: CareerWorkspaceTab) => setActiveTabState(nextTab));

  const handleRequestChatFocus = useCallback(() => {
    if (typeof document === "undefined") return;

    const chatPanel = document.getElementById("career-chat-panel");
    const composer = document.getElementById(
      "career-chat-composer"
    ) as HTMLTextAreaElement | null;

    chatPanel?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
    composer?.focus();
  }, []);
  const pendingInternalRoleFeedbackCount = useMemo(
    () =>
      historyOpportunities.filter(
        (item) => item.feedback === null && item.sourceType === "internal"
      ).length,
    [historyOpportunities]
  );

  const isMobileViewport = useIsMobile();
  if (isMobileViewport) {
    return (
      <CareerWorkspaceMobileLayout
        activeTab={activeTab}
        onChangeTab={handleChangeTab}
        pendingInternalRoleFeedbackCount={pendingInternalRoleFeedbackCount}
      />
    );
  }

  return (
    <div className="flex min-h-svh w-full flex-col lg:h-svh lg:overflow-hidden">
      <CareerWorkspaceNav />
      <div
        ref={workspaceRef}
        className="flex w-full flex-col lg:min-h-0 lg:flex-1 lg:flex-row lg:overflow-hidden"
      >
        <section
          id="career-chat-panel"
          className="flex h-[55vh] min-h-0 min-w-0 flex-col border-b border-beige900/10 bg-beige50 lg:h-auto lg:flex-none lg:border-b-0"
          style={
            isDesktop
              ? {
                  flexBasis: `calc(${chatPanelWidth}% - ${
                    CHAT_PANEL_RESIZE_HANDLE_WIDTH_PX / 2
                  }px)`,
                }
              : undefined
          }
        >
          <div className="min-h-0 flex-1 bg-beige100 p-1">
            <CareerChatPanel />
          </div>
        </section>

        <div
          role="separator"
          tabIndex={isDesktop ? 0 : -1}
          aria-label="채팅 패널 너비 조절"
          aria-orientation="vertical"
          onPointerDown={(event) => {
            event.preventDefault();
            handleResizeStart(event.clientX);
          }}
          onKeyDown={handleResizeKeyDown}
          className="hidden cursor-col-resize items-center justify-center outline-none transition-colors bg-beige50 hover:bg-beige100/80 focus:bg-beige100/80 lg:flex lg:w-2 lg:shrink-0"
        >
          <div className="flex h-16 w-1 items-center justify-center rounded-full">
            <div className="h-10 w-[3px] rounded-full bg-beige900/20" />
          </div>
        </div>

        <section className="min-w-0 flex-1 lg:min-h-0 bg-beige50">
          <div className="flex h-full min-h-[45svh] flex-col lg:min-h-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-8">
              <nav className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-y border-y-black/5 px-3 py-3.5">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeTab;

                  return (
                    <CareerActionButton
                      key={item.id}
                      onClick={() => handleChangeTab(item.id)}
                      active={active}
                      actionVariant="secondary"
                      className="px-6"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                      {item.id === "history" &&
                      pendingInternalRoleFeedbackCount > 0 ? (
                        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-beige900 px-1.5 text-[11px] leading-none text-beige50">
                          {pendingInternalRoleFeedbackCount}
                        </span>
                      ) : null}
                    </CareerActionButton>
                  );
                })}
              </nav>
              <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col">
                <CareerWorkspaceContent
                  activeTab={activeTab}
                  onChangeTab={handleChangeTab}
                  onRequestChatFocus={handleRequestChatFocus}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const WORKSPACE_TAB_OPTIONS: Array<{
  id: CareerWorkspaceTab;
  label: string;
  icon: typeof House;
}> = NAV_ITEMS;

const useMobileUserDisplay = () => {
  const { user, talentProfile } = useCareerSidebarContext();
  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : undefined);
  const profilePicture =
    talentProfile.talentUser?.profile_picture ??
    user?.user_metadata?.avatar_url ??
    null;
  const userEmail = user?.email ?? "";
  return {
    displayName: displayName ?? null,
    profilePicture,
    userEmail,
  };
};

const CareerWorkspaceMobileHistoryView = ({
  activeTab,
  onChangeTab,
  initialHistoryTarget,
  onOpenSupport,
  workspaceTabOptions,
}: {
  activeTab: CareerWorkspaceTab;
  onChangeTab: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
  initialHistoryTarget?: CareerWorkspaceHistoryTarget | null;
  onOpenSupport: () => void;
  workspaceTabOptions: typeof WORKSPACE_TAB_OPTIONS;
}) => {
  const logCareerEvent = useCareerLogEvent();
  const {
    stage,
    isOnboardingDone,
    onOpenSettings,
    onLogout,
    callStartPending,
    onStartCallMode,
    onUseChatOnly,
    historyOpportunities,
    historyOpportunityCounts,
    historyLoading,
    historyLoadingMore,
    historyUpdatingOpportunityIds,
    onLoadMoreHistoryOpportunities,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunityTalentMemo,
    onMarkHistoryOpportunityClicked,
  } = useCareerSidebarContext();
  const { displayName, profilePicture, userEmail } = useMobileUserDisplay();

  const [jobsTab, setJobsTab] = useState<JobsDisplayTab>(() => {
    if (initialHistoryTarget?.historyTab === "saved") {
      return "saved";
    }
    if (initialHistoryTarget?.historyTab === "archived") return "archived";
    return "new";
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [companyDetailCompanyDbId, setCompanyDetailCompanyDbId] = useState<
    number | null
  >(null);
  const [infoOpportunityType, setInfoOpportunityType] =
    useState<CareerOpportunityType | null>(null);
  const [memoPromptOpportunityId, setMemoPromptOpportunityId] = useState<
    string | null
  >(null);
  const [memoPromptDraft, setMemoPromptDraft] = useState("");
  const [
    internalConnectionOnboardingOpportunityId,
    setInternalConnectionOnboardingOpportunityId,
  ] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const handleOpenCompanyInfo = useCallback(
    (item: CareerHistoryOpportunity) => {
      const fallbackUrl = item.companyHomepageUrl ?? item.companyLinkedinUrl;
      if (!item.companyDbId && !fallbackUrl) return;

      logCareerEvent(
        "click_mobile_history_open_company",
        item.companyDbId != null ? { companyId: item.companyDbId } : undefined
      );
      void onMarkHistoryOpportunityClicked(item.id);

      if (item.companyDbId) {
        setCompanyDetailCompanyDbId(item.companyDbId);
        return;
      }

      if (fallbackUrl) {
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      }
    },
    [logCareerEvent, onMarkHistoryOpportunityClicked]
  );
  const handleOpenOpportunityInfo = useCallback(
    (type: CareerOpportunityType) => {
      logCareerEvent(`click_mobile_history_opportunity_info_${type}`);
      setInfoOpportunityType(type);
    },
    [logCareerEvent]
  );

  const handleOpenMemo = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_mobile_history_memo");
      setMemoPromptOpportunityId(item.id);
      setMemoPromptDraft(item.talentMemo ?? "");
    },
    [logCareerEvent]
  );

  const {
    hasMore: hasMoreFilteredOpportunities,
    isLoading: filteredOpportunitiesLoading,
    loadMore: loadMoreFilteredOpportunities,
    opportunities: filteredOpportunities,
    totalCount: filteredOpportunityTotal,
  } = useCareerMobileHistoryOpportunities({
    activeTab: jobsTab,
    historyLoading,
    historyLoadingMore,
    historyOpportunities,
    historyOpportunityCounts,
    onLoadMoreHistoryOpportunities,
  });

  const safeIndex = Math.min(
    Math.max(currentIndex, 0),
    Math.max(filteredOpportunities.length - 1, 0)
  );
  const currentOpportunity = filteredOpportunities[safeIndex] ?? null;
  const internalConnectionOnboardingOpportunity =
    internalConnectionOnboardingOpportunityId
      ? (historyOpportunities.find(
          (item) => item.id === internalConnectionOnboardingOpportunityId
        ) ?? null)
      : null;
  const isCareerOnboardingComplete = isOnboardingDone || stage === "completed";
  const memoPromptOpportunity =
    memoPromptOpportunityId &&
    currentOpportunity?.id === memoPromptOpportunityId
      ? currentOpportunity
      : null;

  const handleSubmitMemo = useCallback(async () => {
    if (!memoPromptOpportunity) return;

    logCareerEvent("click_mobile_history_submit_memo");
    await onUpdateHistoryOpportunityTalentMemo(
      memoPromptOpportunity.id,
      memoPromptDraft
    );
    setMemoPromptOpportunityId(null);
    setMemoPromptDraft("");
  }, [
    logCareerEvent,
    memoPromptDraft,
    memoPromptOpportunity,
    onUpdateHistoryOpportunityTalentMemo,
  ]);

  const handleChangeJobsTab = useCallback(
    (nextTab: JobsDisplayTab) => {
      logCareerEvent(`click_mobile_history_tab_${nextTab}`);
      setJobsTab(nextTab);
      setCurrentIndex(0);
    },
    [logCareerEvent]
  );

  const handleNavigate = useCallback(
    (delta: -1 | 1) => {
      logCareerEvent(
        delta > 0 ? "click_mobile_history_next" : "click_mobile_history_prev"
      );
      const next = currentIndex + delta;
      if (next < 0) {
        setCurrentIndex(0);
        return;
      }
      if (next > filteredOpportunities.length - 1) {
        if (next < filteredOpportunityTotal && hasMoreFilteredOpportunities) {
          loadMoreFilteredOpportunities();
        }
        setCurrentIndex(Math.max(filteredOpportunities.length - 1, 0));
        return;
      }
      setCurrentIndex(next);
    },
    [
      currentIndex,
      filteredOpportunities.length,
      filteredOpportunityTotal,
      hasMoreFilteredOpportunities,
      loadMoreFilteredOpportunities,
      logCareerEvent,
    ]
  );

  const handleDismissHint = useCallback(() => {
    setHintDismissed(true);
  }, []);

  const openInternalConnectionOnboardingModal = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("view_mobile_history_internal_connection_onboarding_gate");
      setInternalConnectionOnboardingOpportunityId(item.id);
    },
    [logCareerEvent]
  );

  const handleStartOnboardingChatFromGate = useCallback(() => {
    logCareerEvent("click_mobile_history_internal_connection_onboarding_chat");
    setChatOpen(true);
    onUseChatOnly?.();
  }, [logCareerEvent, onUseChatOnly]);

  const handleStartOnboardingCallFromGate = useCallback(() => {
    logCareerEvent("click_mobile_history_internal_connection_onboarding_call");
    setChatOpen(true);
    void onStartCallMode?.();
  }, [logCareerEvent, onStartCallMode]);

  const handleTrack = useCallback(() => {
    if (!currentOpportunity) return;
    logCareerEvent("click_mobile_history_positive");
    if (
      shouldBlockInternalConnectionAcceptance(
        currentOpportunity,
        isCareerOnboardingComplete
      )
    ) {
      openInternalConnectionOnboardingModal(currentOpportunity);
      return;
    }

    void onUpdateHistoryOpportunityFeedback(currentOpportunity.id, "positive", {
      interactionSource: "position_tab",
      promptImmediately:
        jobsTab === "new" &&
        currentOpportunity.feedback === null &&
        historyOpportunityCounts.new <= 1,
    });
  }, [
    currentOpportunity,
    historyOpportunityCounts.new,
    isCareerOnboardingComplete,
    jobsTab,
    logCareerEvent,
    openInternalConnectionOnboardingModal,
    onUpdateHistoryOpportunityFeedback,
  ]);
  const handleDismiss = useCallback(() => {
    if (!currentOpportunity) return;
    logCareerEvent("click_mobile_history_negative");
    void onUpdateHistoryOpportunityFeedback(currentOpportunity.id, "negative", {
      interactionSource: "position_tab",
      promptImmediately:
        jobsTab === "new" &&
        currentOpportunity.feedback === null &&
        historyOpportunityCounts.new <= 1,
    });
  }, [
    currentOpportunity,
    historyOpportunityCounts.new,
    jobsTab,
    logCareerEvent,
    onUpdateHistoryOpportunityFeedback,
  ]);

  const actionBar =
    currentOpportunity && jobsTab === "new" ? (
      <JobActionBar
        opportunity={currentOpportunity}
        onTrack={handleTrack}
        onDismiss={handleDismiss}
      />
    ) : null;

  const showHint =
    !hintDismissed &&
    Boolean(currentOpportunity) &&
    filteredOpportunityTotal > 1;

  return (
    <>
      <CareerMobileJobsView
        activeWorkspaceTab={activeTab}
        onChangeWorkspaceTab={onChangeTab}
        workspaceTabOptions={workspaceTabOptions}
        selectedOpportunity={currentOpportunity}
        selectionIndex={safeIndex}
        selectionTotal={Math.max(
          filteredOpportunityTotal,
          filteredOpportunities.length
        )}
        onNavigate={handleNavigate}
        newCount={historyOpportunityCounts.new}
        savedCount={historyOpportunityCounts.saved}
        archivedCount={historyOpportunityCounts.archived}
        activeJobsTab={jobsTab}
        onChangeJobsTab={handleChangeJobsTab}
        profilePicture={profilePicture}
        userName={displayName}
        userEmail={userEmail}
        onOpenSettings={onOpenSettings}
        onOpenSupport={onOpenSupport}
        onLogout={onLogout}
        bottomReservePx={actionBar ? 200 : 120}
        isLoading={filteredOpportunitiesLoading}
        showSwipeHint={showHint}
        onDismissSwipeHint={handleDismissHint}
        onOpenCompanyInfo={handleOpenCompanyInfo}
        onOpenOpportunityInfo={handleOpenOpportunityInfo}
        onEditMemo={handleOpenMemo}
      />
      <CareerMobileChatLauncher
        actionBar={actionBar}
        open={chatOpen}
        onOpenChange={setChatOpen}
      >
        <CareerChatPanel />
      </CareerMobileChatLauncher>
      <InternalConnectionOnboardingModal
        open={Boolean(internalConnectionOnboardingOpportunity)}
        callPending={Boolean(callStartPending)}
        onClose={() => setInternalConnectionOnboardingOpportunityId(null)}
        onStartChat={handleStartOnboardingChatFromGate}
        onStartCall={handleStartOnboardingCallFromGate}
      />
      <HistoryOpportunityInfoModal
        opportunityType={infoOpportunityType}
        onClose={() => setInfoOpportunityType(null)}
      />
      <HistoryMemoModal
        item={memoPromptOpportunity}
        draft={memoPromptDraft}
        pending={
          memoPromptOpportunity
            ? historyUpdatingOpportunityIds.includes(memoPromptOpportunity.id)
            : false
        }
        onChangeDraft={setMemoPromptDraft}
        onClose={() => {
          setMemoPromptOpportunityId(null);
          setMemoPromptDraft("");
        }}
        onSubmit={handleSubmitMemo}
      />
      <CareerCompanyDetailDrawer
        companyDbId={companyDetailCompanyDbId}
        open={companyDetailCompanyDbId !== null}
        onClose={() => setCompanyDetailCompanyDbId(null)}
        source="mobile_position_company_detail"
      />
    </>
  );
};

const TAB_TRANSITION = { duration: 0.18, ease: "easeOut" } as const;
const TAB_MOTION_PROPS = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: TAB_TRANSITION,
} as const;

const CareerWorkspaceMobileLayout = ({
  activeTab,
  onChangeTab,
  pendingInternalRoleFeedbackCount,
}: {
  activeTab: CareerWorkspaceTab;
  onChangeTab: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
  pendingInternalRoleFeedbackCount: number;
}) => {
  const logCareerEvent = useCareerLogEvent();
  const { onOpenSettings, onLogout } = useCareerSidebarContext();
  const { displayName, profilePicture, userEmail } = useMobileUserDisplay();
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const startQuery = new URLSearchParams(window.location.search).get("start");
    return startQuery === "call" || startQuery === "chat";
  });
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [pendingHistoryTarget, setPendingHistoryTarget] =
    useState<CareerWorkspaceHistoryTarget | null>(null);
  const handleOpenSupport = useCallback(() => {
    logCareerEvent("click_open_support");
    setInquiryOpen(true);
  }, [logCareerEvent]);

  const handleChangeTab = useCallback(
    (
      nextTab: CareerWorkspaceTab,
      options?: CareerWorkspaceNavigationOptions
    ) => {
      if (nextTab === "history") {
        setPendingHistoryTarget(options?.historyTarget ?? null);
      } else if (activeTab === "history") {
        setPendingHistoryTarget(null);
      }
      onChangeTab(nextTab, options);
    },
    [activeTab, onChangeTab]
  );
  const workspaceTabOptions = useMemo(
    () =>
      WORKSPACE_TAB_OPTIONS.map((option) =>
        option.id === "history" && pendingInternalRoleFeedbackCount > 0
          ? { ...option, badgeCount: pendingInternalRoleFeedbackCount }
          : option
      ),
    [pendingInternalRoleFeedbackCount]
  );

  const mobileHeader = (
    <CareerMobileTopBar
      activeTab={activeTab}
      options={workspaceTabOptions}
      onChangeTab={handleChangeTab}
      profilePicture={profilePicture}
      userName={displayName}
      userEmail={userEmail}
      onOpenSettings={onOpenSettings}
      onOpenSupport={handleOpenSupport}
      onLogout={onLogout}
    />
  );

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === "history" ? (
          <motion.div key="history" {...TAB_MOTION_PROPS}>
            <CareerWorkspaceMobileHistoryView
              activeTab={activeTab}
              onChangeTab={handleChangeTab}
              initialHistoryTarget={pendingHistoryTarget}
              onOpenSupport={handleOpenSupport}
              workspaceTabOptions={workspaceTabOptions}
            />
          </motion.div>
        ) : (
          <motion.div key="shell" {...TAB_MOTION_PROPS}>
            <CareerMobileShell header={mobileHeader}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={activeTab} {...TAB_MOTION_PROPS}>
                  {activeTab === "home" ? (
                    <CareerMobileHomeView
                      onOpenChat={() => {
                        logCareerEvent("click_mobile_open_chat");
                        setChatOpen(true);
                      }}
                      onOpenHistory={(historyTarget) =>
                        handleChangeTab("history", { historyTarget })
                      }
                    />
                  ) : activeTab === "watchlist" ? (
                    <div className="px-4 pb-[140px] pt-2">
                      <CareerCompanyWatchlistPanel />
                    </div>
                  ) : (
                    <div className="px-4 pb-[140px] pt-2">
                      <CareerProfileWorkspace />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </CareerMobileShell>
            <CareerMobileChatLauncher
              open={chatOpen}
              onOpenChange={setChatOpen}
            >
              <CareerChatPanel />
            </CareerMobileChatLauncher>
          </motion.div>
        )}
      </AnimatePresence>
      {inquiryOpen && (
        <CareerSupportInquiryModal
          onClose={() => setInquiryOpen(false)}
          defaultEmail={userEmail}
        />
      )}
    </>
  );
};
