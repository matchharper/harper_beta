import {
  BriefcaseBusiness,
  GalleryVerticalEnd,
  House,
  Inbox,
  Loader2,
  User,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import CareerChatPanel from "@/components/career/CareerChatPanel";
import CareerHistoryPanel from "@/components/career/CareerHistoryPanel";
import CareerHomePanel from "@/components/career/CareerHomePanel";
import CareerProfileWorkspace from "@/components/career/profile/CareerProfileWorkspace";
import CareerCompanyWatchlistPanel from "@/components/career/watchlist/CareerCompanyWatchlistPanel";
import CareerCompanyDetailDrawer from "@/components/career/watchlist/CareerCompanyDetailDrawer";
import CareerSupportInquiryModal from "@/components/career/CareerSupportInquiryModal";
import HistoryOpportunityInfoModal from "@/components/career/history/HistoryOppotunityInfoModal";
import InternalConnectionOnboardingModal, {
  shouldBlockInternalConnectionAcceptance,
} from "@/components/career/InternalConnectionOnboardingModal";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import CareerWorkspaceNav, {
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/ui/button";
import CareerMobileJobsView, {
  JobActionBar,
} from "@/components/career/mobile/jobs/CareerMobileJobsView";
import CareerMobileChatLauncher from "@/components/career/mobile/CareerMobileChatLauncher";
import CareerMobileHomeView from "@/components/career/mobile/CareerMobileHomeView";
import CareerMobileShell from "@/components/career/mobile/CareerMobileShell";
import CareerMobileTopBar, {
  type CareerMobileTopBarOption,
  type CareerMobileTopBarOptionId,
} from "@/components/career/mobile/CareerMobileTopBar";
import { useIsMobile, useMediaQuery } from "@/hooks/useMediaQuery";
import { useResizableSplitPanel } from "@/hooks/useResizableSplitPanel";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import {
  CAREER_CHAT_PANEL_DEFAULT_WIDTH_PCT,
  CAREER_CHAT_PANEL_MAX_WIDTH_PCT,
  CAREER_CHAT_PANEL_MIN_WIDTH_PCT,
  useCareerWorkspaceUiStore,
} from "@/store/useCareerWorkspaceUiStore";
import {
  useCareerMobileHistoryOpportunities,
  type CareerMobileHistoryJobsTab,
} from "@/hooks/career/useCareerMobileHistoryOpportunities";
import type {
  CareerHistoryOpportunity,
  CareerOpportunitySavedStageFilter,
  CareerOpportunityType,
} from "@/components/career/types";
import { AnimatePresence, motion } from "motion/react";
import React from "react";
import { useCareerT } from "@/i18n/useCareerT";
import {
  canChangeCareerOpportunityManagementStatus,
  getCareerOpportunityManagementStatus,
  getSavedStageForManagementStatus,
  type CareerOpportunityManagementStatus,
} from "@/components/career/history/savedOpportunityStatus";
import {
  getAuthenticatedUserProfileImageUrl,
  getCareerMenuProfileImageUrl,
} from "@/components/career/profileAvatar";

type JobsDisplayTab = CareerMobileHistoryJobsTab;

type CareerWorkspaceHistoryTarget = {
  historyTab: "new" | "saved" | "archived";
  savedStage?: CareerOpportunitySavedStageFilter;
};

type CareerWorkspaceNavigationOptions = {
  historyTarget?: CareerWorkspaceHistoryTarget;
};

type CareerWorkspaceViewportMode = "desktop" | "mobile";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const CHAT_PANEL_RESIZE_HANDLE_WIDTH_PX = 8;

type WorkspaceTabOption = {
  id: CareerWorkspaceTab;
  label: string;
  icon: typeof House;
};

type CareerTLike = ReturnType<typeof useCareerT>;
const fallbackCareerT: CareerTLike = (_key, koSource) => koSource;

const getWorkspaceTabOptions = (t: CareerTLike): WorkspaceTabOption[] => [
  {
    id: "home",
    label: t("career.common.career_workspace_screen.1kr4bnb", "홈"),
    icon: House,
  },
  {
    id: "history",
    label: t("career.common.career_workspace_screen.0jpahnv", "포지션"),
    icon: GalleryVerticalEnd,
  },
  {
    id: "profile",
    label: t("career.common.career_workspace_screen.0b0v9cr", "프로필"),
    icon: User,
  },
];

export const NAV_ITEMS: WorkspaceTabOption[] =
  getWorkspaceTabOptions(fallbackCareerT);

const getMobileWorkspaceTabOptions = (
  t: CareerTLike
): CareerMobileTopBarOption[] => [
  {
    id: "home",
    label: t("career.common.career_workspace_screen.1kr4bnb", "홈"),
    icon: House,
  },
  {
    id: "inbox",
    label: t(
      "career.common.career_workspace_screen.mobile_inbox",
      "추천된 기회"
    ),
    icon: Inbox,
  },
  {
    id: "jobs",
    label: t("career.common.career_workspace_screen.mobile_jobs", "보관함"),
    icon: BriefcaseBusiness,
  },
  {
    id: "profile",
    label: t("career.common.career_workspace_screen.0b0v9cr", "프로필"),
    icon: User,
  },
];

const MOBILE_WORKSPACE_TAB_OPTIONS: CareerMobileTopBarOption[] =
  getMobileWorkspaceTabOptions(fallbackCareerT);

const CareerCanvas = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <section className={cn("min-w-0 px-4", className)}>{children}</section>;

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

export const CareerLoadingState = () => {
  const t = useCareerT();

  return (
    <main className="relative flex min-h-svh w-full items-center justify-center bg-bg-basement text-neutral-primary">
      <Loader2 className="h-5 w-5 animate-spin text-neutral-soft" />
      <span className="sr-only">
        {t(
          "career.common.career_workspace_screen.1nwthrd",
          "커리어 페이지 로딩 중"
        )}
      </span>
    </main>
  );
};

const CareerWorkspaceScreen = ({
  activeTab,
  onChangeTab,
  children,
  fillParent = false,
  forcedViewport,
  initialMobileChatOpen = false,
}: {
  activeTab?: CareerWorkspaceTab;
  children?: React.ReactNode;
  fillParent?: boolean;
  forcedViewport?: CareerWorkspaceViewportMode;
  initialMobileChatOpen?: boolean;
  onChangeTab?: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
}) => (
  <main
    className={cn(
      "relative w-full bg-bg-basement text-neutral-primary",
      fillParent ? "h-full min-h-0 overflow-hidden" : "min-h-svh"
    )}
  >
    {children ?? (
      <CareerWorkspaceRoot
        activeTab={activeTab}
        fillParent={fillParent}
        forcedViewport={forcedViewport}
        initialMobileChatOpen={initialMobileChatOpen}
        onChangeTab={onChangeTab}
      />
    )}
  </main>
);

export default React.memo(CareerWorkspaceScreen);

const CareerWorkspaceRoot = ({
  activeTab: controlledActiveTab,
  fillParent = false,
  forcedViewport,
  initialMobileChatOpen = false,
  onChangeTab: controlledOnChangeTab,
}: {
  activeTab?: CareerWorkspaceTab;
  fillParent?: boolean;
  forcedViewport?: CareerWorkspaceViewportMode;
  initialMobileChatOpen?: boolean;
  onChangeTab?: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
}) => {
  const t = useCareerT();

  const [activeTabState, setActiveTabState] =
    useState<CareerWorkspaceTab>("home");
  const mediaIsDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const isDesktop =
    forcedViewport != null ? forcedViewport === "desktop" : mediaIsDesktop;
  const forceDesktopLayout = forcedViewport === "desktop";
  const persistedChatPanelWidth = useCareerWorkspaceUiStore(
    (state) => state.chatPanelWidthPct
  );
  const setPersistedChatPanelWidth = useCareerWorkspaceUiStore(
    (state) => state.setChatPanelWidthPct
  );
  const handleChatPanelResizeEnd = useCallback(
    (widthPct: number) => {
      setPersistedChatPanelWidth(widthPct);
    },
    [setPersistedChatPanelWidth]
  );
  const {
    containerRef: workspaceRef,
    widthPct: chatPanelWidth,
    handleResizeStart,
    handleResizeKeyDown,
  } = useResizableSplitPanel({
    enabled: isDesktop,
    minPct: CAREER_CHAT_PANEL_MIN_WIDTH_PCT,
    maxPct: CAREER_CHAT_PANEL_MAX_WIDTH_PCT,
    defaultPct: isDesktop
      ? persistedChatPanelWidth
      : CAREER_CHAT_PANEL_DEFAULT_WIDTH_PCT,
    onResizeEnd: handleChatPanelResizeEnd,
  });
  const { historyOpportunityCounts } = useCareerSidebarContext();
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
  const pendingInternalRoleFeedbackCount = historyOpportunityCounts.newInternal;
  const navItems = useMemo(() => getWorkspaceTabOptions(t), [t]);

  const detectedMobileViewport = useIsMobile();
  const isMobileViewport =
    forcedViewport != null
      ? forcedViewport === "mobile"
      : detectedMobileViewport;
  if (isMobileViewport) {
    return (
      <CareerWorkspaceMobileLayout
        activeTab={activeTab}
        initialChatOpen={initialMobileChatOpen}
        onChangeTab={handleChangeTab}
        pendingInternalRoleFeedbackCount={pendingInternalRoleFeedbackCount}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        fillParent
          ? "h-full min-h-0 overflow-hidden"
          : "min-h-svh md:h-svh md:overflow-hidden"
      )}
    >
      <CareerWorkspaceNav />
      <div
        ref={workspaceRef}
        className={cn(
          "flex w-full flex-col md:min-h-0 md:flex-1 md:flex-row md:overflow-hidden",
          fillParent && "min-h-0 flex-1 overflow-hidden",
          forceDesktopLayout && "min-h-0 flex-1 flex-row overflow-hidden"
        )}
      >
        <section
          id="career-chat-panel"
          className={cn(
            "flex min-h-0 min-w-0 flex-col border-b border-neutral-1000-a05 bg-bg-default md:flex-none md:border-b-0",
            forceDesktopLayout
              ? "h-auto flex-none border-b-0"
              : fillParent
                ? "h-full"
                : "h-[55vh] md:h-auto"
          )}
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
          <div className="min-h-0 flex-1 bg-bg-default">
            <CareerChatPanel />
          </div>
        </section>

        <div
          role="separator"
          tabIndex={isDesktop ? 0 : -1}
          aria-label={"채팅 패널 너비 조절"}
          aria-orientation="vertical"
          onPointerDown={(event) => {
            event.preventDefault();
            handleResizeStart(event.clientX);
          }}
          onKeyDown={handleResizeKeyDown}
          className={cn(
            "hidden cursor-col-resize items-center justify-center bg-bg-basement outline-none transition-colors hover:bg-bg-weak focus:bg-bg-weak md:flex md:w-2 md:shrink-0",
            forceDesktopLayout && "flex w-2 shrink-0"
          )}
        >
          <div className="flex h-16 w-1 items-center justify-center rounded-full">
            <div className="h-10 w-[3px] rounded-full bg-black/20" />
          </div>
        </div>

        <section
          className={cn(
            "min-w-0 flex-1 bg-bg-basement md:min-h-0",
            forceDesktopLayout && "min-h-0"
          )}
        >
          <div
            className={cn(
              "flex h-full min-h-[45svh] flex-col md:min-h-0",
              forceDesktopLayout && "min-h-0"
            )}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-8">
              <nav className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-neutral-1000-a05 px-3 py-3.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeTab;

                  return (
                    <ActionButton
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
                        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-lg bg-sky-600 px-2.5 text-[11px] leading-none text-neutral-00">
                          {pendingInternalRoleFeedbackCount}
                        </span>
                      ) : null}
                    </ActionButton>
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

const useMobileUserDisplay = () => {
  const { preferredLocale, user, talentProfile } = useCareerSidebarContext();
  const authDisplayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : undefined);
  const displayName = talentProfile.talentUser?.name ?? authDisplayName;
  const profilePicture = getCareerMenuProfileImageUrl({
    authenticatedUserImageUrl: getAuthenticatedUserProfileImageUrl(user),
    talentProfileImageUrl: talentProfile.talentUser?.profile_picture,
  });
  const userEmail = talentProfile.talentUser?.email ?? user?.email ?? "";
  return {
    displayName: displayName ?? null,
    preferredLocale,
    profileCurrentLocation: talentProfile.talentUser?.current_location ?? null,
    profilePicture,
    profileLocation: talentProfile.talentUser?.location ?? null,
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
  workspaceTabOptions: typeof MOBILE_WORKSPACE_TAB_OPTIONS;
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
    onUpdateHistoryOpportunitySavedStage,
    onUpdateHistoryOpportunityTalentMemo,
    onMarkHistoryOpportunityClicked,
  } = useCareerSidebarContext();
  const {
    displayName,
    preferredLocale,
    profileCurrentLocation,
    profileLocation,
    profilePicture,
    userEmail,
  } = useMobileUserDisplay();

  const [jobsTab, setJobsTab] = useState<JobsDisplayTab>(() => {
    if (initialHistoryTarget?.historyTab === "saved") {
      if (
        initialHistoryTarget.savedStage === "applied" ||
        initialHistoryTarget.savedStage === "connected" ||
        initialHistoryTarget.savedStage === "closed" ||
        initialHistoryTarget.savedStage === "hidden"
      ) {
        return initialHistoryTarget.savedStage;
      }
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
  const [detailOpportunityId, setDetailOpportunityId] = useState<string | null>(
    null
  );
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
  const mobileJobsStatusCounts = useMemo(
    () => ({
      applied: historyOpportunityCounts.savedStages.applied,
      archived: historyOpportunityCounts.archived,
      closed: historyOpportunityCounts.savedStages.closed,
      connected: historyOpportunityCounts.savedStages.connected,
      hidden: historyOpportunityCounts.savedStages.hidden,
      saved: historyOpportunityCounts.savedStages.saved,
    }),
    [
      historyOpportunityCounts.archived,
      historyOpportunityCounts.savedStages.applied,
      historyOpportunityCounts.savedStages.closed,
      historyOpportunityCounts.savedStages.connected,
      historyOpportunityCounts.savedStages.hidden,
      historyOpportunityCounts.savedStages.saved,
    ]
  );
  const pendingOpportunityIds = useMemo(
    () => new Set(historyUpdatingOpportunityIds),
    [historyUpdatingOpportunityIds]
  );

  const safeIndex = Math.min(
    Math.max(currentIndex, 0),
    Math.max(filteredOpportunities.length - 1, 0)
  );
  const currentOpportunity = filteredOpportunities[safeIndex] ?? null;
  const detailOpportunity = detailOpportunityId
    ? (historyOpportunities.find((item) => item.id === detailOpportunityId) ??
      null)
    : null;
  const internalConnectionOnboardingOpportunity =
    internalConnectionOnboardingOpportunityId
      ? (historyOpportunities.find(
          (item) => item.id === internalConnectionOnboardingOpportunityId
        ) ?? null)
      : null;
  const isCareerOnboardingComplete = isOnboardingDone || stage === "completed";

  const handleChangeJobsTab = useCallback(
    (nextTab: JobsDisplayTab) => {
      logCareerEvent(`click_mobile_history_tab_${nextTab}`);
      setJobsTab(nextTab);
      setCurrentIndex(0);
      setDetailOpportunityId(null);
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

  const handleOpenDetail = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_mobile_history_open_detail");
      setDetailOpportunityId(item.id);
    },
    [logCareerEvent]
  );

  const handleOpenLink = useCallback(
    (item: CareerHistoryOpportunity, url: string | null | undefined) => {
      if (!url) return;
      logCareerEvent(
        "click_mobile_history_open_jd",
        item.companyDbId != null ? { companyId: item.companyDbId } : undefined
      );
      void onMarkHistoryOpportunityClicked(item.id);
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [logCareerEvent, onMarkHistoryOpportunityClicked]
  );

  const handleStatusChange = useCallback(
    (
      item: CareerHistoryOpportunity,
      status: CareerOpportunityManagementStatus
    ) => {
      if (!canChangeCareerOpportunityManagementStatus(item)) return;
      if (getCareerOpportunityManagementStatus(item) === status) return;

      logCareerEvent(`click_mobile_history_status_${status}`);

      if (status === "archived") {
        void onUpdateHistoryOpportunityFeedback(item.id, "negative", {
          interactionSource: "position_tab",
        });
        return;
      }

      const savedStage = getSavedStageForManagementStatus(status);
      if (!savedStage) return;

      if (item.feedback === "positive") {
        void onUpdateHistoryOpportunitySavedStage(item.id, savedStage);
        return;
      }

      void onUpdateHistoryOpportunityFeedback(item.id, "positive", {
        interactionSource: "position_tab",
        savedStage,
      });
    },
    [
      logCareerEvent,
      onUpdateHistoryOpportunityFeedback,
      onUpdateHistoryOpportunitySavedStage,
    ]
  );

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
        onChangeWorkspaceTab={onChangeTab}
        workspaceTabOptions={workspaceTabOptions}
        statusCounts={mobileJobsStatusCounts}
        opportunities={filteredOpportunities}
        selectedOpportunity={currentOpportunity}
        selectionIndex={safeIndex}
        selectionTotal={Math.max(
          filteredOpportunityTotal,
          filteredOpportunities.length
        )}
        onNavigate={handleNavigate}
        hasMoreOpportunities={hasMoreFilteredOpportunities}
        onLoadMoreOpportunities={loadMoreFilteredOpportunities}
        pendingOpportunityIds={pendingOpportunityIds}
        activeJobsTab={jobsTab}
        onChangeJobsTab={handleChangeJobsTab}
        profilePicture={profilePicture}
        userName={displayName}
        userEmail={userEmail}
        profileLocation={profileLocation}
        profileCurrentLocation={profileCurrentLocation}
        preferredLocale={preferredLocale}
        onOpenSettings={onOpenSettings}
        onOpenSupport={onOpenSupport}
        onLogout={onLogout}
        bottomReservePx={actionBar ? 200 : 120}
        isLoading={filteredOpportunitiesLoading}
        showSwipeHint={showHint}
        onDismissSwipeHint={handleDismissHint}
        detailOpportunity={detailOpportunity}
        onCloseDetail={() => setDetailOpportunityId(null)}
        onOpenCompanyInfo={handleOpenCompanyInfo}
        onOpenDetail={handleOpenDetail}
        onOpenLink={handleOpenLink}
        onOpenOpportunityInfo={handleOpenOpportunityInfo}
        onStatusChange={handleStatusChange}
        onUpdateTalentMemo={(item, talentMemo) =>
          onUpdateHistoryOpportunityTalentMemo(item.id, talentMemo)
        }
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
  initialChatOpen,
  onChangeTab,
  pendingInternalRoleFeedbackCount,
}: {
  activeTab: CareerWorkspaceTab;
  initialChatOpen?: boolean;
  onChangeTab: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
  pendingInternalRoleFeedbackCount: number;
}) => {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const { onOpenSettings, onLogout } = useCareerSidebarContext();
  const {
    displayName,
    preferredLocale,
    profileCurrentLocation,
    profileLocation,
    profilePicture,
    userEmail,
  } = useMobileUserDisplay();
  const [chatOpen, setChatOpen] = useState(() => {
    if (initialChatOpen) return true;
    if (typeof window === "undefined") return false;
    const startQuery = new URLSearchParams(window.location.search).get("start");
    return startQuery === "call" || startQuery === "chat";
  });
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [pendingHistoryTarget, setPendingHistoryTarget] =
    useState<CareerWorkspaceHistoryTarget | null>(null);
  const baseWorkspaceTabOptions = useMemo(
    () => getMobileWorkspaceTabOptions(t),
    [t]
  );
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
  const handleTopBarOptionChange = useCallback(
    (nextOption: CareerMobileTopBarOptionId) => {
      if (nextOption === "inbox") {
        handleChangeTab("history", { historyTarget: { historyTab: "new" } });
        return;
      }

      if (nextOption === "jobs") {
        handleChangeTab("history", {
          historyTarget: { historyTab: "saved", savedStage: "saved" },
        });
        return;
      }

      handleChangeTab(nextOption);
    },
    [handleChangeTab]
  );
  const workspaceTabOptions = useMemo(
    () =>
      baseWorkspaceTabOptions.map((option) =>
        option.id === "inbox" && pendingInternalRoleFeedbackCount > 0
          ? { ...option, badgeCount: pendingInternalRoleFeedbackCount }
          : option
      ),
    [baseWorkspaceTabOptions, pendingInternalRoleFeedbackCount]
  );

  const mobileHeader = (
    <CareerMobileTopBar
      activeTab={activeTab}
      options={workspaceTabOptions}
      onChangeTab={handleTopBarOptionChange}
      profilePicture={profilePicture}
      userName={displayName}
      userEmail={userEmail}
      profileLocation={profileLocation}
      profileCurrentLocation={profileCurrentLocation}
      preferredLocale={preferredLocale}
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
