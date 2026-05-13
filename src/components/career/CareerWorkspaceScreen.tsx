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
import { mapOpportunityToJobSummary } from "@/components/career/mobile/jobs/mapOpportunityToJobSummary";
import CareerMobileChatLauncher from "@/components/career/mobile/CareerMobileChatLauncher";
import CareerMobileShell from "@/components/career/mobile/CareerMobileShell";
import CareerMobileTopBar from "@/components/career/mobile/CareerMobileTopBar";
import { useIsMobile } from "@/hooks/useMediaQuery";
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
  <main className="relative flex min-h-screen w-full items-center justify-center bg-hblack000 font-geist text-hblack900">
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
  <main className="relative min-h-screen w-full bg-beige50 font-geist text-beige900">
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
    <div className="flex min-h-screen w-full flex-col lg:h-screen lg:overflow-hidden">
      <CareerWorkspaceNav />
      <div
        ref={workspaceRef}
        className="flex w-full flex-col lg:min-h-0 lg:flex-1 lg:flex-row lg:overflow-hidden"
      >
        <section
          id="career-chat-panel"
          className="flex h-[55vh] min-h-0 min-w-0 flex-col border-b border-beige900/10 bg-beige50 lg:h-auto lg:flex-none lg:border-b-0"
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
          <div className="flex h-full min-h-[45vh] flex-col lg:min-h-0">
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

const CareerWorkspaceMobileLayout = ({
  activeTab,
  onChangeTab,
}: {
  activeTab: CareerWorkspaceTab;
  onChangeTab: (tab: CareerWorkspaceTab) => void;
}) => {
  const {
    user,
    onOpenSettings,
    talentProfile,
    historyOpportunities,
    historyOpportunityCounts,
    historyLoading,
    onUpdateHistoryOpportunityFeedback,
  } = useCareerSidebarContext();
  const [jobsTab, setJobsTab] = useState<JobsDisplayTab>("new");

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string"
      ? user.email.split("@")[0]
      : undefined);
  const profilePicture =
    talentProfile.talentUser?.profile_picture ??
    user?.user_metadata?.avatar_url ??
    null;

  const filterMode = JOBS_TAB_TO_FEEDBACK[jobsTab];
  const currentOpportunity = useMemo(() => {
    if (activeTab !== "history") return null;
    return (
      historyOpportunities.find((item) => {
        if (filterMode === "new") return item.feedback === null;
        return item.feedback === filterMode;
      }) ?? null
    );
  }, [activeTab, historyOpportunities, filterMode]);

  const selectedJob = useMemo(
    () => (currentOpportunity ? mapOpportunityToJobSummary(currentOpportunity) : null),
    [currentOpportunity]
  );

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
    selectedJob && jobsTab === "new" ? (
      <JobActionBar onTrack={handleTrack} onDismiss={handleDismiss} />
    ) : null;

  if (activeTab === "history") {
    return (
      <>
        <CareerMobileJobsView
          activeWorkspaceTab={activeTab}
          onChangeWorkspaceTab={onChangeTab}
          workspaceTabOptions={WORKSPACE_TAB_OPTIONS}
          selectedJob={selectedJob}
          newCount={historyOpportunityCounts.new}
          trackingCount={historyOpportunityCounts.saved}
          archivedCount={historyOpportunityCounts.archived}
          activeJobsTab={jobsTab}
          onChangeJobsTab={setJobsTab}
          profilePicture={profilePicture ?? null}
          userName={displayName ?? null}
          onOpenSettings={onOpenSettings}
          bottomReservePx={actionBar ? 200 : 120}
          isLoading={historyLoading}
        />
        <CareerMobileChatLauncher actionBar={actionBar}>
          <CareerChatPanel />
        </CareerMobileChatLauncher>
      </>
    );
  }

  const mobileHeader = (
    <CareerMobileTopBar
      activeTab={activeTab}
      options={WORKSPACE_TAB_OPTIONS}
      onChangeTab={onChangeTab}
      profilePicture={profilePicture ?? null}
      userName={displayName ?? null}
      onOpenSettings={onOpenSettings}
    />
  );

  return (
    <>
      <CareerMobileShell header={mobileHeader}>
        <div
          className="flex flex-1 items-center justify-center px-6 py-16 text-center text-[15px] text-beige900/55"
          style={{ paddingBottom: "140px" }}
        >
          {activeTab === "home"
            ? "홈 모바일 화면은 곧 추가됩니다."
            : "프로필 모바일 화면은 곧 추가됩니다."}
        </div>
      </CareerMobileShell>
      <CareerMobileChatLauncher>
        <CareerChatPanel />
      </CareerMobileChatLauncher>
    </>
  );
};
