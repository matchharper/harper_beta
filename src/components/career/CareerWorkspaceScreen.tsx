import { GalleryVerticalEnd, House, Loader2, User } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import CareerChatPanel from "@/components/career/CareerChatPanel";
import CareerHistoryPanel from "@/components/career/CareerHistoryPanel";
import CareerHomePanel from "@/components/career/CareerHomePanel";
import CareerProfileWorkspace from "@/components/career/profile/CareerProfileWorkspace";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import CareerWorkspaceNav, {
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { careerCx } from "@/components/career/ui/CareerPrimitives";
import CareerMobileJobsView, {
  JobActionBar,
  type JobsDisplayTab,
} from "@/components/career/mobile/jobs/CareerMobileJobsView";
import CareerMobileChatLauncher from "@/components/career/mobile/CareerMobileChatLauncher";
import CareerMobileHomeView from "@/components/career/mobile/CareerMobileHomeView";
import CareerMobileShell from "@/components/career/mobile/CareerMobileShell";
import CareerMobileTopBar from "@/components/career/mobile/CareerMobileTopBar";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useCompanyModalStore } from "@/store/useModalStore";
import { useQueryClient } from "@tanstack/react-query";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { AnimatePresence, motion } from "motion/react";
import React from "react";

type CareerWorkspaceHistoryTarget = {
  historyTab: "new" | "saved" | "archived";
  savedStage?: "saved" | "applied" | "connected" | "closed";
};

type CareerWorkspaceNavigationOptions = {
  historyTarget?: CareerWorkspaceHistoryTarget;
};

const DESKTOP_MEDIA_QUERY = "(min-width: 720px)";
const CHAT_PANEL_MIN_WIDTH = 36;
const CHAT_PANEL_MAX_WIDTH = 64;
const CHAT_PANEL_DEFAULT_WIDTH = 50;

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
  const workspaceRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [activeTabState, setActiveTabState] =
    useState<CareerWorkspaceTab>("home");
  const [isDesktop, setIsDesktop] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(
    CHAT_PANEL_DEFAULT_WIDTH
  );
  const { stage } = useCareerSidebarContext();
  const activeTab = controlledActiveTab ?? activeTabState;
  const handleChangeTab =
    controlledOnChangeTab ??
    ((nextTab: CareerWorkspaceTab) => setActiveTabState(nextTab));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const syncDesktopState = () => setIsDesktop(mediaQuery.matches);

    syncDesktopState();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncDesktopState);
      return () => mediaQuery.removeEventListener("change", syncDesktopState);
    }

    mediaQuery.addListener(syncDesktopState);
    return () => mediaQuery.removeListener(syncDesktopState);
  }, []);

  const updateChatPanelWidth = useCallback((clientX: number) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const bounds = workspace.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const nextWidth = ((clientX - bounds.left) / bounds.width) * 100;
    const clampedWidth = Math.min(
      CHAT_PANEL_MAX_WIDTH,
      Math.max(CHAT_PANEL_MIN_WIDTH, nextWidth)
    );

    setChatPanelWidth(clampedWidth);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      updateChatPanelWidth(event.clientX);
    };

    const handlePointerUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDesktop, updateChatPanelWidth]);

  const handleResizeStart = useCallback(
    (clientX: number) => {
      if (!isDesktop) return;
      draggingRef.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      updateChatPanelWidth(clientX);
    },
    [isDesktop, updateChatPanelWidth]
  );

  const handleResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isDesktop) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setChatPanelWidth((current) =>
          Math.max(CHAT_PANEL_MIN_WIDTH, current - 2)
        );
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setChatPanelWidth((current) =>
          Math.min(CHAT_PANEL_MAX_WIDTH, current + 2)
        );
      }
    },
    [isDesktop]
  );

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
  const hasPendingSetup = stage !== "completed";

  const isMobileViewport = useIsMobile();
  if (isMobileViewport) {
    return (
      <CareerWorkspaceMobileLayout
        activeTab={activeTab}
        onChangeTab={handleChangeTab}
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
          className="flex h-[55svh] min-h-0 min-w-0 flex-col border-b border-beige900/10 bg-beige50 lg:h-auto lg:flex-none lg:border-b-0"
          style={isDesktop ? { flexBasis: `${chatPanelWidth}%` } : undefined}
        >
          <div className="min-h-0 flex-1 bg-beige200 p-1">
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
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleChangeTab(item.id)}
                      className={careerCx(
                        "inline-flex h-10 items-center gap-2 rounded-full border px-6 text-sm font-medium transition-all",
                        active
                          ? "border-beige700 bg-white text-beige700"
                          : "text-beige900 hover:bg-beige500 border-transparent"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                      {item.id === "home" && hasPendingSetup ? (
                        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-beige900 px-1.5 text-[11px] leading-none text-beige50">
                          1
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
              <div className="mx-auto flex w-full max-w-[920px] flex-1 flex-col">
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
}> = [
  { id: "home", label: "홈" },
  { id: "history", label: "포지션" },
  { id: "profile", label: "프로필" },
];

const JOBS_TAB_TO_FEEDBACK: Record<JobsDisplayTab, "new" | "positive" | "negative"> = {
  new: "new",
  tracking: "positive",
  archived: "negative",
};

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
  return { displayName: displayName ?? null, profilePicture };
};

const CareerWorkspaceMobileHistoryView = ({
  activeTab,
  onChangeTab,
  initialHistoryTarget,
}: {
  activeTab: CareerWorkspaceTab;
  onChangeTab: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
  initialHistoryTarget?: CareerWorkspaceHistoryTarget | null;
}) => {
  const {
    onOpenSettings,
    historyOpportunities,
    historyOpportunityCounts,
    historyLoading,
    onUpdateHistoryOpportunityFeedback,
    onMarkHistoryOpportunityClicked,
  } = useCareerSidebarContext();
  const { displayName, profilePicture } = useMobileUserDisplay();
  const openCompanyModal = useCompanyModalStore((s) => s.handleOpenCompany);
  const queryClient = useQueryClient();

  const [jobsTab, setJobsTab] = useState<JobsDisplayTab>(() => {
    if (initialHistoryTarget?.historyTab === "saved") return "tracking";
    if (initialHistoryTarget?.historyTab === "archived") return "archived";
    return "new";
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hintDismissed, setHintDismissed] = useState(false);

  const handleOpenCompanyInfo = useCallback(
    (item: CareerHistoryOpportunity) => {
      const fallbackUrl = item.companyHomepageUrl ?? item.companyLinkedinUrl;
      if (!item.companyDbId && !fallbackUrl) return;

      void onMarkHistoryOpportunityClicked(item.id);

      if (item.companyDbId) {
        void openCompanyModal({
          companyId: item.companyDbId,
          fallbackUrl,
          openWhenIncomplete: true,
          queryClient,
          tone: "career",
        });
        return;
      }

      if (fallbackUrl) {
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      }
    },
    [onMarkHistoryOpportunityClicked, openCompanyModal, queryClient]
  );

  const filterMode = JOBS_TAB_TO_FEEDBACK[jobsTab];
  const filteredOpportunities = useMemo(
    () =>
      historyOpportunities.filter((item) => {
        if (filterMode === "new") return item.feedback === null;
        return item.feedback === filterMode;
      }),
    [historyOpportunities, filterMode]
  );

  const safeIndex = Math.min(
    Math.max(currentIndex, 0),
    Math.max(filteredOpportunities.length - 1, 0)
  );
  const currentOpportunity = filteredOpportunities[safeIndex] ?? null;

  const handleChangeJobsTab = useCallback((nextTab: JobsDisplayTab) => {
    setJobsTab(nextTab);
    setCurrentIndex(0);
  }, []);

  const handleNavigate = useCallback(
    (delta: -1 | 1) => {
      setCurrentIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return 0;
        if (next > filteredOpportunities.length - 1) {
          return Math.max(filteredOpportunities.length - 1, 0);
        }
        return next;
      });
    },
    [filteredOpportunities.length]
  );

  const handleDismissHint = useCallback(() => {
    setHintDismissed(true);
  }, []);

  const handleTrack = useCallback(() => {
    if (!currentOpportunity) return;
    void onUpdateHistoryOpportunityFeedback(currentOpportunity.id, "positive", {
      interactionSource: "position_tab",
    });
  }, [currentOpportunity, onUpdateHistoryOpportunityFeedback]);
  const handleDismiss = useCallback(() => {
    if (!currentOpportunity) return;
    void onUpdateHistoryOpportunityFeedback(currentOpportunity.id, "negative", {
      interactionSource: "position_tab",
    });
  }, [currentOpportunity, onUpdateHistoryOpportunityFeedback]);

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
    filteredOpportunities.length > 1;

  return (
    <>
      <CareerMobileJobsView
        activeWorkspaceTab={activeTab}
        onChangeWorkspaceTab={onChangeTab}
        workspaceTabOptions={WORKSPACE_TAB_OPTIONS}
        selectedOpportunity={currentOpportunity}
        selectionIndex={safeIndex}
        selectionTotal={filteredOpportunities.length}
        onNavigate={handleNavigate}
        newCount={historyOpportunityCounts.new}
        trackingCount={historyOpportunityCounts.saved}
        archivedCount={historyOpportunityCounts.archived}
        activeJobsTab={jobsTab}
        onChangeJobsTab={handleChangeJobsTab}
        profilePicture={profilePicture}
        userName={displayName}
        onOpenSettings={onOpenSettings}
        bottomReservePx={actionBar ? 200 : 120}
        isLoading={historyLoading}
        showSwipeHint={showHint}
        onDismissSwipeHint={handleDismissHint}
        onOpenCompanyInfo={handleOpenCompanyInfo}
      />
      <CareerMobileChatLauncher actionBar={actionBar}>
        <CareerChatPanel />
      </CareerMobileChatLauncher>
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
}: {
  activeTab: CareerWorkspaceTab;
  onChangeTab: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
}) => {
  const { onOpenSettings } = useCareerSidebarContext();
  const { displayName, profilePicture } = useMobileUserDisplay();
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingHistoryTarget, setPendingHistoryTarget] =
    useState<CareerWorkspaceHistoryTarget | null>(null);

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

  const mobileHeader = (
    <CareerMobileTopBar
      activeTab={activeTab}
      options={WORKSPACE_TAB_OPTIONS}
      onChangeTab={handleChangeTab}
      profilePicture={profilePicture}
      userName={displayName}
      onOpenSettings={onOpenSettings}
    />
  );

  return (
    <AnimatePresence mode="wait" initial={false}>
      {activeTab === "history" ? (
        <motion.div key="history" {...TAB_MOTION_PROPS}>
          <CareerWorkspaceMobileHistoryView
            activeTab={activeTab}
            onChangeTab={handleChangeTab}
            initialHistoryTarget={pendingHistoryTarget}
          />
        </motion.div>
      ) : (
        <motion.div key="shell" {...TAB_MOTION_PROPS}>
          <CareerMobileShell header={mobileHeader}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={activeTab} {...TAB_MOTION_PROPS}>
                {activeTab === "home" ? (
                  <CareerMobileHomeView
                    onOpenChat={() => setChatOpen(true)}
                    onOpenHistory={(historyTarget) =>
                      handleChangeTab("history", { historyTarget })
                    }
                  />
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
  );
};
