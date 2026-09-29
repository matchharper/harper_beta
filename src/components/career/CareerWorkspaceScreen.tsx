import {
  BriefcaseBusiness,
  House,
  Inbox,
  Loader2,
  SlidersHorizontal,
  User,
  LucideSquareDashedKanban,
  TextSelect,
} from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CareerChatPanel from "@/components/career/CareerChatPanel";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import CareerHistoryPanel from "@/components/career/CareerHistoryPanel";
import CareerTasksPanel from "@/components/career/CareerTasksPanel";
import CareerProfileWorkspace from "@/components/career/profile/CareerProfileWorkspace";
import CareerCompanyWatchlistPanel from "@/components/career/watchlist/CareerCompanyWatchlistPanel";
import CareerCompanyDetailDrawer from "@/components/career/watchlist/CareerCompanyDetailDrawer";
import CareerSupportInquiryModal from "@/components/career/CareerSupportInquiryModal";
import HistoryOpportunityInfoModal from "@/components/career/history/HistoryOppotunityInfoModal";
import InternalConnectionAcceptanceModal from "@/components/career/InternalConnectionAcceptanceModal";
import {
  useCareerHistoryContext,
  useCareerProfileContext,
  useCareerSidebarContext,
} from "@/components/career/CareerSidebarContext";
import CareerWorkspaceNav, {
  CareerNewOpportunityIcon,
  getCareerDesktopNavLabels,
  type CareerDesktopNavTab,
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { cn } from "@/lib/utils";
import { useCareerTasks } from "@/hooks/career/useCareerTasks";
import type { CareerComposerPendingAction } from "@/lib/career/pendingActions";
import { DocumentEditorPanelProvider } from "@/components/ui/document-editor";
import { SectionTitle } from "@/components/ui/section-header";
import CareerMobileJobsView from "@/components/career/mobile/jobs/CareerMobileJobsView";
import CareerMobileChatLauncher from "@/components/career/mobile/CareerMobileChatLauncher";
import { CareerMobileChatLauncherVisibilityProvider } from "@/components/career/mobile/CareerMobileChatLauncherVisibilityContext";
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
import {
  InternalOpportunityDecisionChangeModal,
  type InternalOpportunityDecisionChangeRequest,
} from "@/components/career/history/InternalOpportunityDecisionActions";
import {
  HistoryNegativeFeedbackModal,
  hasExternalAlreadyAppliedFeedbackReason,
  parseNegativeFeedbackReason,
  serializeNegativeFeedbackReason,
} from "@/components/career/history/FeedbackModal";
import { EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON } from "@/components/career/opportunityTypeMeta";

type JobsDisplayTab = CareerMobileHistoryJobsTab;

type CareerWorkspaceHistoryTarget = {
  historyTab: "new" | "saved" | "archived";
  roleId?: string;
  savedStage?: CareerOpportunitySavedStageFilter;
};

type CareerWorkspaceNavigationOptions = {
  historyTarget?: CareerWorkspaceHistoryTarget;
};

type CareerWorkspaceViewportMode = "desktop" | "mobile";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const CHAT_PANEL_RESIZE_HANDLE_WIDTH_PX = 8;
const CAREER_HISTORY_PATHNAME = "/career/history";
const CAREER_PREVIEW_PATHNAME = "/career/preview";

const getSingleQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getMobileHistoryJobsTab = ({
  historyTab,
  savedStage,
}: {
  historyTab: string | string[] | undefined;
  savedStage: string | string[] | undefined;
}): JobsDisplayTab => {
  const normalizedHistoryTab = getSingleQueryValue(historyTab);
  const normalizedSavedStage = getSingleQueryValue(savedStage);

  if (normalizedHistoryTab === "archived") return "archived";
  if (normalizedHistoryTab !== "saved") return "new";
  if (
    normalizedSavedStage === "applied" ||
    normalizedSavedStage === "connected" ||
    normalizedSavedStage === "closed" ||
    normalizedSavedStage === "hidden"
  ) {
    return normalizedSavedStage;
  }
  return "saved";
};

const getInitialMobileHistoryJobsTab = (
  historyTarget: CareerWorkspaceHistoryTarget | null | undefined
): JobsDisplayTab => {
  if (historyTarget?.historyTab === "archived") return "archived";
  if (historyTarget?.historyTab !== "saved") return "new";
  if (
    historyTarget.savedStage === "applied" ||
    historyTarget.savedStage === "connected" ||
    historyTarget.savedStage === "closed" ||
    historyTarget.savedStage === "hidden"
  ) {
    return historyTarget.savedStage;
  }
  return "saved";
};

const getHistoryLocationState = (tab: JobsDisplayTab) => {
  if (tab === "new") {
    return { historyTab: "new" as const, savedStage: null };
  }
  if (tab === "archived") {
    return { historyTab: "archived" as const, savedStage: null };
  }
  return { historyTab: "saved" as const, savedStage: tab };
};

type CareerTLike = ReturnType<typeof useCareerT>;
const fallbackCareerT: CareerTLike = (_key, koSource) => koSource;

const getMobileWorkspaceTabOptions = (
  t: CareerTLike
): CareerMobileTopBarOption[] => [
  {
    id: "home",
    label: t("career.common.career_workspace_screen.1kr4bnb", "홈"),
    icon: House,
  },
  {
    id: "tasks",
    label: t("career.tasks.title", "할 일"),
    icon: Inbox,
  },
  {
    id: "inbox",
    label: t("career.workspace.new_opportunities", "새 기회"),
    icon: CareerNewOpportunityIcon,
  },
  {
    id: "jobs",
    label: t("career.workspace.my_opportunities", "내 기회"),
    icon: BriefcaseBusiness,
  },
  {
    id: "profile",
    label: t("career.common.career_workspace_screen.0b0v9cr", "프로필"),
    icon: User,
  },
  {
    id: "brief",
    label: t(
      "career.profile.career_profile_workspace.search_brief_tab",
      "선호 기준"
    ),
    icon: TextSelect,
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
  onOpenRightPanelDetail,
  onRequestChatFocus,
  onOpenChatAction,
}: {
  activeTab: CareerWorkspaceTab;
  onChangeTab: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
  onOpenRightPanelDetail: () => void;
  onRequestChatFocus: () => void;
  onOpenChatAction: (action: CareerComposerPendingAction) => void;
}) => {
  if (activeTab === "history") {
    return (
      <CareerCanvas className="min-h-full">
        <CareerHistoryPanel navigationMode="sidebar" />
      </CareerCanvas>
    );
  }

  if (activeTab === "tasks" || activeTab === "home") {
    return (
      <CareerCanvas>
        <CareerTasksPanel
          showTitle={false}
          onOpenChat={onRequestChatFocus}
          onOpenChatAction={onOpenChatAction}
          onOpenOpportunity={(roleId, historyTab) =>
            onChangeTab("history", {
              historyTarget: {
                historyTab,
                roleId,
                ...(historyTab === "saved"
                  ? { savedStage: "connected" as const }
                  : {}),
              },
            })
          }
          onOpenProfile={() => onChangeTab("profile")}
        />
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
      <CareerProfileWorkspace
        view={activeTab === "brief" ? "brief" : "profile"}
        onDetailOpen={onOpenRightPanelDetail}
      />
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
  const router = useRouter();
  const t = useCareerT();
  const { inputMode } = useCareerChatPanelContext();
  const { decisionCount } = useCareerTasks();
  const [pendingChatAction, setPendingChatAction] =
    useState<CareerComposerPendingAction | null>(null);
  const clearPendingChatAction = useCallback(
    () => setPendingChatAction(null),
    []
  );

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
  const { historyOpportunityCounts } = useCareerHistoryContext();
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
  const rightPanelScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRightPanelToTop = useCallback(() => {
    rightPanelScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  const pendingInternalRoleFeedbackCount = historyOpportunityCounts.newInternal;
  const pendingExternalRoleFeedbackCount =
    historyOpportunityCounts.new - pendingInternalRoleFeedbackCount;
  const desktopActiveTab = activeTab === "home" ? "tasks" : activeTab;
  const requestedHistoryTab = getSingleQueryValue(router.query.historyTab);
  const desktopNavTab: CareerDesktopNavTab | null =
    desktopActiveTab === "history"
      ? requestedHistoryTab === "saved" || requestedHistoryTab === "archived"
        ? "saved"
        : "new"
      : desktopActiveTab === "watchlist"
        ? null
        : desktopActiveTab;
  const rightPanelTitle = desktopNavTab
    ? getCareerDesktopNavLabels(t)[desktopNavTab]
    : t("career.call.internal_opportunity_call_actions.0fpx491", "회사");
  const isCallInProgress = inputMode === "call";

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
        pendingExternalRoleFeedbackCount={pendingExternalRoleFeedbackCount}
        decisionCount={decisionCount}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-row",
        fillParent
          ? "h-full min-h-0 overflow-hidden"
          : "min-h-svh md:h-svh md:overflow-hidden"
      )}
    >
      <CareerWorkspaceNav
        activeTab={desktopNavTab}
        decisionCount={decisionCount}
        pendingInternalRoleFeedbackCount={pendingInternalRoleFeedbackCount}
        pendingExternalRoleFeedbackCount={pendingExternalRoleFeedbackCount}
        onChangeTab={(tab) => {
          if (tab === "new" || tab === "saved") {
            handleChangeTab("history", {
              historyTarget: {
                historyTab: tab,
                ...(tab === "saved" ? { savedStage: "all" as const } : {}),
              },
            });
          } else {
            handleChangeTab(tab);
          }
          scrollRightPanelToTop();
        }}
      />
      <div
        ref={workspaceRef}
        className={cn(
          "relative flex min-w-0 flex-1 flex-col md:min-h-0 md:flex-row md:overflow-hidden",
          fillParent && "min-h-0 flex-1 overflow-hidden",
          forceDesktopLayout && "min-h-0 flex-1 flex-row overflow-hidden"
        )}
      >
        <section
          id="career-chat-panel"
          className={cn(
            "flex min-h-0 min-w-0 flex-col border-b border-neutral-1000-a05 bg-bg-basement md:flex-none md:border-b-0",
            isCallInProgress
              ? "transition-[flex-basis] duration-500 ease-in-out motion-reduce:transition-none"
              : "transition-none",
            forceDesktopLayout
              ? "h-auto flex-none border-b-0"
              : fillParent
                ? "h-full"
                : "h-[55vh] md:h-auto"
          )}
          style={
            isDesktop
              ? {
                  flexBasis: isCallInProgress
                    ? "100%"
                    : `calc(${chatPanelWidth}% - ${
                        CHAT_PANEL_RESIZE_HANDLE_WIDTH_PX / 2
                      }px)`,
                }
              : undefined
          }
        >
          <div className="min-h-0 flex-1">
            <CareerChatPanel
              pendingAction={pendingChatAction}
              onPendingActionHandled={clearPendingChatAction}
            />
          </div>
        </section>

        <div
          aria-hidden={isCallInProgress}
          inert={isCallInProgress ? true : undefined}
          style={{
            width: `calc(${100 - chatPanelWidth}% + ${
              CHAT_PANEL_RESIZE_HANDLE_WIDTH_PX / 2
            }px)`,
          }}
          className={cn(
            "absolute inset-y-0 right-0 z-10 flex min-w-0 border-l border-neutral-1000-a05 will-change-transform",
            isCallInProgress
              ? "transition-[opacity,translate] duration-500 ease-in-out motion-reduce:transition-none"
              : "transition-none",
            isCallInProgress
              ? "pointer-events-none translate-x-full opacity-0"
              : "translate-x-0 opacity-100"
          )}
        >
          <div
            role="separator"
            tabIndex={isDesktop && !isCallInProgress ? 0 : -1}
            aria-label={"채팅 패널 너비 조절"}
            aria-orientation="vertical"
            onPointerDown={(event) => {
              event.preventDefault();
              handleResizeStart(event.clientX);
            }}
            onKeyDown={handleResizeKeyDown}
            className={cn(
              "group hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-bg-basement outline-none md:flex",
              forceDesktopLayout && "flex"
            )}
          >
            <div className="flex h-16 w-1 items-center justify-center rounded-full">
              <div className="h-10 w-[3px] rounded-full bg-black/20 transition-colors group-hover:bg-black/35 group-focus-visible:bg-black/35" />
            </div>
          </div>

          <section
            aria-labelledby="career-right-panel-title"
            id="career-right-panel"
            className={cn(
              "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-basement md:min-h-0",
              forceDesktopLayout && "min-h-0"
            )}
          >
            <header className="flex h-14 shrink-0 items-center border-b border-neutral-1000-a05 px-4">
              <SectionTitle
                as="h1"
                className="truncate font-normal"
                id="career-right-panel-title"
              >
                {rightPanelTitle}
              </SectionTitle>
            </header>
            <div className="relative min-h-0 flex-1">
              <DocumentEditorPanelProvider
                onOpenDocument={scrollRightPanelToTop}
              >
                <div
                  className={cn(
                    "flex h-full min-h-[45svh] flex-col md:min-h-0",
                    forceDesktopLayout && "min-h-0"
                  )}
                >
                  <div
                    ref={rightPanelScrollRef}
                    className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-8"
                  >
                    <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col">
                      <CareerWorkspaceContent
                        activeTab={desktopActiveTab}
                        onChangeTab={handleChangeTab}
                        onOpenRightPanelDetail={scrollRightPanelToTop}
                        onRequestChatFocus={handleRequestChatFocus}
                        onOpenChatAction={(action) => {
                          setPendingChatAction(action);
                          handleRequestChatFocus();
                        }}
                      />
                    </div>
                  </div>
                </div>
              </DocumentEditorPanelProvider>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const useMobileUserDisplay = () => {
  const { preferredLocale, user, talentProfile } = useCareerProfileContext();
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
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const {
    stage,
    isOnboardingDone,
    onOpenSettings,
    onLogout,
    callStartPending,
    onStartCallMode,
    onUseChatOnly,
  } = useCareerSidebarContext();
  const {
    historyOpportunities,
    historyOpportunityCounts,
    historyLoading,
    historyLoadingMore,
    historyUpdatingOpportunityIds,
    historyUpdateError,
    onLoadMoreHistoryOpportunities,
    onLoadHistoryOpportunityByRoleId,
    onChangeInternalHistoryOpportunityDecision,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
    onUpdateHistoryOpportunityTalentMemo,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
  } = useCareerHistoryContext();
  const {
    displayName,
    preferredLocale,
    profileCurrentLocation,
    profileLocation,
    profilePicture,
    userEmail,
  } = useMobileUserDisplay();

  const jobsTab = getSingleQueryValue(router.query.historyTab)
    ? getMobileHistoryJobsTab({
        historyTab: router.query.historyTab,
        savedStage: router.query.savedStage,
      })
    : getInitialMobileHistoryJobsTab(initialHistoryTarget);
  const [internalDecisionChangeRequest, setInternalDecisionChangeRequest] =
    useState<InternalOpportunityDecisionChangeRequest | null>(null);
  const [companyDetailCompanyDbId, setCompanyDetailCompanyDbId] = useState<
    number | null
  >(null);
  const [companyDetailOpportunity, setCompanyDetailOpportunity] =
    useState<CareerHistoryOpportunity | null>(null);
  const [infoOpportunityType, setInfoOpportunityType] =
    useState<CareerOpportunityType | null>(null);
  const [
    internalConnectionAcceptanceOpportunity,
    setInternalConnectionAcceptanceOpportunity,
  ] = useState<CareerHistoryOpportunity | null>(null);
  const [negativePromptOpportunityId, setNegativePromptOpportunityId] =
    useState<string | null>(null);
  const [negativePromptSelectedOptions, setNegativePromptSelectedOptions] =
    useState<string[]>([]);
  const [negativePromptCustomReason, setNegativePromptCustomReason] =
    useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const loadingRoleIdRef = useRef<string | null>(null);
  const workspaceNavigationPendingRef = useRef(false);

  const requestedRoleId = String(
    getSingleQueryValue(router.query.id) ?? ""
  ).trim();
  const requestedOpportunity = requestedRoleId
    ? (historyOpportunities.find(
        (item) => String(item.roleId ?? "").trim() === requestedRoleId
      ) ?? null)
    : null;
  const negativePromptOpportunity = negativePromptOpportunityId
    ? (historyOpportunities.find(
        (item) => item.id === negativePromptOpportunityId
      ) ?? null)
    : null;

  const updateMobileHistoryLocation = useCallback(
    (
      nextTab: JobsDisplayTab,
      options?: {
        mode?: "push" | "replace";
        roleId?: string | null;
      }
    ) => {
      if (!router.isReady) return;
      if (workspaceNavigationPendingRef.current) return;

      const locationState = getHistoryLocationState(nextTab);
      const roleId = String(options?.roleId ?? "").trim();
      const currentPathname =
        router.asPath.split(/[?#]/)[0]?.replace(/\/+$/, "") || "";
      const pathname =
        currentPathname === CAREER_PREVIEW_PATHNAME
          ? CAREER_PREVIEW_PATHNAME
          : CAREER_HISTORY_PATHNAME;
      const query: Record<string, string | string[] | undefined> = {
        ...router.query,
        historyTab: locationState.historyTab,
      };
      if (pathname === CAREER_PREVIEW_PATHNAME) {
        query.tab = "history";
      } else {
        delete query.tab;
      }

      if (locationState.savedStage) {
        query.savedStage = locationState.savedStage;
      } else {
        delete query.savedStage;
      }

      if (roleId) {
        query.id = roleId;
      } else {
        delete query.id;
      }

      const currentHistoryTab = getSingleQueryValue(router.query.historyTab);
      const currentSavedStage = getSingleQueryValue(router.query.savedStage);
      const currentRoleId = String(
        getSingleQueryValue(router.query.id) ?? ""
      ).trim();
      if (
        currentPathname === pathname &&
        currentHistoryTab === locationState.historyTab &&
        (currentSavedStage ?? null) === locationState.savedStage &&
        currentRoleId === roleId
      ) {
        return;
      }

      const nextLocation = { pathname, query };
      if (options?.mode === "replace") {
        void router.replace(nextLocation, undefined, {
          shallow: true,
          scroll: false,
        });
        return;
      }
      void router.push(nextLocation, undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [router]
  );

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
        setCompanyDetailOpportunity(item);
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

  const requestedOpportunityIndex = requestedRoleId
    ? filteredOpportunities.findIndex(
        (item) => String(item.roleId ?? "").trim() === requestedRoleId
      )
    : -1;
  const currentOpportunity =
    jobsTab === "new" && requestedOpportunityIndex >= 0
      ? filteredOpportunities[requestedOpportunityIndex]
      : null;
  const detailOpportunity =
    jobsTab !== "new" && requestedRoleId && requestedOpportunityIndex >= 0
      ? filteredOpportunities[requestedOpportunityIndex]
      : null;
  const isCareerOnboardingComplete = isOnboardingDone || stage === "completed";

  useEffect(() => {
    if (
      !router.isReady ||
      !requestedRoleId ||
      requestedOpportunity?.activityTimelineLoaded ||
      historyLoading ||
      loadingRoleIdRef.current === requestedRoleId
    ) {
      return;
    }

    loadingRoleIdRef.current = requestedRoleId;
    void Promise.resolve(onLoadHistoryOpportunityByRoleId(requestedRoleId))
      .catch(() => null)
      .finally(() => {
        if (loadingRoleIdRef.current === requestedRoleId) {
          loadingRoleIdRef.current = null;
        }
      });
  }, [
    historyLoading,
    onLoadHistoryOpportunityByRoleId,
    requestedOpportunity,
    requestedRoleId,
    router.isReady,
  ]);

  useEffect(() => {
    if (!currentOpportunity || currentOpportunity.viewedAt) return;
    void onMarkHistoryOpportunityViewed(currentOpportunity.id);
  }, [currentOpportunity, onMarkHistoryOpportunityViewed]);

  const handleToggleNewOpportunity = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_mobile_history_toggle_new_opportunity");
      updateMobileHistoryLocation("new", {
        roleId: currentOpportunity?.id === item.id ? null : item.roleId,
      });
    },
    [currentOpportunity, logCareerEvent, updateMobileHistoryLocation]
  );

  const handleChangeJobsTab = useCallback(
    (nextTab: JobsDisplayTab) => {
      logCareerEvent(`click_mobile_history_tab_${nextTab}`);
      updateMobileHistoryLocation(nextTab, {
        roleId: null,
      });
    },
    [logCareerEvent, updateMobileHistoryLocation]
  );

  const handleMobileNavigationChange = useCallback(
    (nextOption: CareerMobileTopBarOptionId) => {
      if (nextOption === "inbox") {
        workspaceNavigationPendingRef.current = false;
        handleChangeJobsTab("new");
        return;
      }

      if (nextOption === "jobs") {
        workspaceNavigationPendingRef.current = false;
        handleChangeJobsTab(jobsTab === "new" ? "saved" : jobsTab);
        return;
      }

      workspaceNavigationPendingRef.current = true;
      onChangeTab(nextOption);
    },
    [handleChangeJobsTab, jobsTab, onChangeTab]
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

  const closeDecidedOpportunityInLocation = useCallback(
    (item: CareerHistoryOpportunity) => {
      if (jobsTab !== "new" || requestedRoleId !== item.roleId) return;
      updateMobileHistoryLocation("new", { mode: "replace", roleId: null });
    },
    [jobsTab, requestedRoleId, updateMobileHistoryLocation]
  );

  const handleTrack = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_mobile_history_positive");
      if (item.sourceType === "internal") {
        logCareerEvent(
          "view_mobile_history_internal_connection_acceptance_modal"
        );
        setInternalConnectionAcceptanceOpportunity(item);
        return;
      }
      closeDecidedOpportunityInLocation(item);
      void onUpdateHistoryOpportunityFeedback(item.id, "positive", {
        interactionSource: "position_tab",
        promptImmediately:
          jobsTab === "new" &&
          item.feedback === null &&
          historyOpportunityCounts.new <= 1,
      });
    },
    [
      closeDecidedOpportunityInLocation,
      historyOpportunityCounts.new,
      jobsTab,
      logCareerEvent,
      onUpdateHistoryOpportunityFeedback,
    ]
  );

  const requestNegativeFeedback = useCallback(
    (item: CareerHistoryOpportunity) => {
      const parsedReason = parseNegativeFeedbackReason(item);
      setNegativePromptOpportunityId(item.id);
      setNegativePromptSelectedOptions(parsedReason.selectedOptions);
      setNegativePromptCustomReason(parsedReason.customReason);
    },
    []
  );

  const toggleNegativeFeedbackOption = useCallback((value: string) => {
    setNegativePromptSelectedOptions((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }, []);

  const handleDismiss = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_mobile_history_negative");
      requestNegativeFeedback(item);
    },
    [logCareerEvent, requestNegativeFeedback]
  );

  const handleSubmitNegativePrompt = useCallback(() => {
    if (!negativePromptOpportunity) return;

    logCareerEvent("click_mobile_history_submit_negative_reason");
    const feedbackReason = serializeNegativeFeedbackReason({
      customReason: negativePromptCustomReason,
      item: negativePromptOpportunity,
      selectedOptions: negativePromptSelectedOptions,
    });

    closeDecidedOpportunityInLocation(negativePromptOpportunity);
    if (
      jobsTab !== "new" &&
      requestedRoleId === String(negativePromptOpportunity.roleId ?? "").trim()
    ) {
      updateMobileHistoryLocation(jobsTab, {
        mode: "replace",
        roleId: null,
      });
    }
    if (
      hasExternalAlreadyAppliedFeedbackReason(negativePromptSelectedOptions)
    ) {
      void onUpdateHistoryOpportunityFeedback(
        negativePromptOpportunity.id,
        "positive",
        {
          feedbackReason: EXTERNAL_ALREADY_APPLIED_FEEDBACK_REASON,
          interactionSource: "position_tab",
          promptImmediately:
            jobsTab === "new" &&
            negativePromptOpportunity.feedback === null &&
            historyOpportunityCounts.new <= 1,
          savedStage: "closed",
        }
      );
    } else {
      void onUpdateHistoryOpportunityFeedback(
        negativePromptOpportunity.id,
        "negative",
        {
          feedbackReason,
          interactionSource: "position_tab",
          promptImmediately:
            jobsTab === "new" &&
            negativePromptOpportunity.feedback === null &&
            historyOpportunityCounts.new <= 1,
        }
      );
    }

    setNegativePromptOpportunityId(null);
    setNegativePromptSelectedOptions([]);
    setNegativePromptCustomReason("");
  }, [
    historyOpportunityCounts.new,
    jobsTab,
    logCareerEvent,
    negativePromptCustomReason,
    negativePromptOpportunity,
    negativePromptSelectedOptions,
    onUpdateHistoryOpportunityFeedback,
    closeDecidedOpportunityInLocation,
    requestedRoleId,
    updateMobileHistoryLocation,
  ]);

  const closeNegativePrompt = useCallback(() => {
    setNegativePromptOpportunityId(null);
    setNegativePromptSelectedOptions([]);
    setNegativePromptCustomReason("");
  }, []);

  const handleOpenDetail = useCallback(
    (item: CareerHistoryOpportunity) => {
      logCareerEvent("click_mobile_history_open_detail");
      updateMobileHistoryLocation(jobsTab, { roleId: item.roleId });
    },
    [jobsTab, logCareerEvent, updateMobileHistoryLocation]
  );

  const handleCloseDetail = useCallback(() => {
    updateMobileHistoryLocation(jobsTab, {
      mode: "replace",
      roleId: null,
    });
  }, [jobsTab, updateMobileHistoryLocation]);

  const handleStatusChange = useCallback(
    (
      item: CareerHistoryOpportunity,
      status: CareerOpportunityManagementStatus
    ) => {
      if (!canChangeCareerOpportunityManagementStatus(item)) return;
      if (getCareerOpportunityManagementStatus(item) === status) return;

      logCareerEvent(`click_mobile_history_status_${status}`);

      if (status === "archived") {
        requestNegativeFeedback(item);
        return;
      }

      const savedStage = getSavedStageForManagementStatus(status);
      if (!savedStage) return;

      if (
        item.feedback === "positive" ||
        (savedStage === "hidden" &&
          item.sourceType === "external" &&
          item.feedback === null)
      ) {
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
      requestNegativeFeedback,
    ]
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

  const handleInternalDecisionChangeConfirm = useCallback(
    async (request: InternalOpportunityDecisionChangeRequest) => {
      logCareerEvent(
        `click_mobile_history_internal_decision_${request.action}_confirm`
      );
      const changed = await onChangeInternalHistoryOpportunityDecision(
        request.item.id,
        request.action,
        request.reason
      );
      if (!changed) return false;

      setInternalDecisionChangeRequest(null);
      if (
        request.action === "revert" &&
        detailOpportunity?.id === request.item.id
      ) {
        updateMobileHistoryLocation(jobsTab, {
          mode: "replace",
          roleId: null,
        });
      }
      return true;
    },
    [
      detailOpportunity,
      jobsTab,
      logCareerEvent,
      onChangeInternalHistoryOpportunityDecision,
      updateMobileHistoryLocation,
    ]
  );

  return (
    <>
      <CareerMobileJobsView
        onChangeWorkspaceTab={onChangeTab}
        onChangeTopBarOption={handleMobileNavigationChange}
        workspaceTabOptions={workspaceTabOptions}
        statusCounts={mobileJobsStatusCounts}
        opportunities={filteredOpportunities}
        selectedOpportunity={currentOpportunity}
        internalOpportunityCount={historyOpportunityCounts.newInternal}
        totalOpportunityCount={historyOpportunityCounts.new}
        onToggleOpportunity={handleToggleNewOpportunity}
        onPositive={handleTrack}
        onNegative={handleDismiss}
        loadingMore={historyLoading || historyLoadingMore}
        error={historyUpdateError}
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
        bottomReservePx={120}
        isLoading={filteredOpportunitiesLoading}
        detailOpportunity={detailOpportunity}
        onCloseDetail={handleCloseDetail}
        onOpenCompanyInfo={handleOpenCompanyInfo}
        onOpenChat={() => {
          logCareerEvent("click_mobile_history_role_action_open_chat");
          setChatOpen(true);
        }}
        onOpenDetail={handleOpenDetail}
        onOpenLink={handleOpenLink}
        onOpenOpportunityInfo={handleOpenOpportunityInfo}
        onInternalDecisionAction={(item, action) =>
          setInternalDecisionChangeRequest({ action, item })
        }
        onStatusChange={handleStatusChange}
        onUpdateTalentMemo={(item, talentMemo) =>
          onUpdateHistoryOpportunityTalentMemo(item.id, talentMemo)
        }
      />
      <CareerMobileChatLauncher
        navigation={{
          activeTab: jobsTab === "new" ? "inbox" : "jobs",
          onChangeTab: handleMobileNavigationChange,
          options: workspaceTabOptions,
        }}
        open={chatOpen}
        onOpenChange={setChatOpen}
      >
        <CareerChatPanel />
      </CareerMobileChatLauncher>
      <InternalConnectionAcceptanceModal
        item={internalConnectionAcceptanceOpportunity}
        isOnboardingComplete={isCareerOnboardingComplete}
        pending={
          internalConnectionAcceptanceOpportunity
            ? pendingOpportunityIds.has(
                internalConnectionAcceptanceOpportunity.id
              )
            : false
        }
        callPending={Boolean(callStartPending)}
        onClose={() => setInternalConnectionAcceptanceOpportunity(null)}
        onAccept={(feedbackReason) => {
          if (!internalConnectionAcceptanceOpportunity) return;
          logCareerEvent(
            "click_mobile_history_submit_internal_connection_acceptance"
          );
          closeDecidedOpportunityInLocation(
            internalConnectionAcceptanceOpportunity
          );
          return onUpdateHistoryOpportunityFeedback(
            internalConnectionAcceptanceOpportunity.id,
            "positive",
            {
              feedbackReason,
              interactionSource: "position_tab",
              promptImmediately:
                jobsTab === "new" &&
                internalConnectionAcceptanceOpportunity.feedback === null &&
                historyOpportunityCounts.new <= 1,
            }
          );
        }}
        onStartChat={handleStartOnboardingChatFromGate}
        onStartCall={handleStartOnboardingCallFromGate}
      />
      <HistoryNegativeFeedbackModal
        item={negativePromptOpportunity}
        customReason={negativePromptCustomReason}
        selectedOptions={negativePromptSelectedOptions}
        pending={
          negativePromptOpportunity
            ? pendingOpportunityIds.has(negativePromptOpportunity.id)
            : false
        }
        onChangeCustomReason={setNegativePromptCustomReason}
        onToggleOption={toggleNegativeFeedbackOption}
        onClose={closeNegativePrompt}
        onSubmit={handleSubmitNegativePrompt}
      />
      <HistoryOpportunityInfoModal
        opportunityType={infoOpportunityType}
        onClose={() => setInfoOpportunityType(null)}
      />
      {internalDecisionChangeRequest ? (
        <InternalOpportunityDecisionChangeModal
          error={historyUpdateError}
          request={internalDecisionChangeRequest}
          onClose={() => setInternalDecisionChangeRequest(null)}
          onConfirm={handleInternalDecisionChangeConfirm}
        />
      ) : null}
      <CareerCompanyDetailDrawer
        companyDbId={companyDetailCompanyDbId}
        mobileLayout
        open={companyDetailCompanyDbId !== null}
        onClose={() => {
          setCompanyDetailCompanyDbId(null);
          setCompanyDetailOpportunity(null);
        }}
        onOpenChat={() => {
          setCompanyDetailCompanyDbId(null);
          setCompanyDetailOpportunity(null);
          logCareerEvent("click_mobile_company_detail_role_action_open_chat");
          setChatOpen(true);
        }}
        opportunity={companyDetailOpportunity}
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
  pendingExternalRoleFeedbackCount,
  decisionCount,
}: {
  activeTab: CareerWorkspaceTab;
  initialChatOpen?: boolean;
  onChangeTab: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
  pendingInternalRoleFeedbackCount: number;
  pendingExternalRoleFeedbackCount: number;
  decisionCount: number;
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
  const [pendingChatAction, setPendingChatAction] =
    useState<CareerComposerPendingAction | null>(null);
  const clearPendingChatAction = useCallback(
    () => setPendingChatAction(null),
    []
  );
  const closeChatForDocument = useCallback(() => setChatOpen(false), []);
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
        option.id === "tasks" && decisionCount > 0
          ? { ...option, badgeCount: decisionCount }
          : option.id === "inbox"
            ? {
                ...option,
                badgeCount:
                  pendingInternalRoleFeedbackCount > 0
                    ? pendingInternalRoleFeedbackCount
                    : pendingExternalRoleFeedbackCount,
                badgeClassName:
                  pendingInternalRoleFeedbackCount > 0
                    ? undefined
                    : "bg-action text-white",
              }
            : option
      ),
    [
      baseWorkspaceTabOptions,
      pendingInternalRoleFeedbackCount,
      pendingExternalRoleFeedbackCount,
      decisionCount,
    ]
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
    <CareerMobileChatLauncherVisibilityProvider>
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
                  ) : activeTab === "tasks" ? (
                    <div className="px-4 pb-[140px]">
                      <CareerTasksPanel
                        onOpenChat={() => setChatOpen(true)}
                        onOpenChatAction={(action) => {
                          setPendingChatAction(action);
                          setChatOpen(true);
                        }}
                        onOpenOpportunity={(roleId, historyTab) =>
                          handleChangeTab("history", {
                            historyTarget: {
                              historyTab,
                              roleId,
                              ...(historyTab === "saved"
                                ? { savedStage: "connected" as const }
                                : {}),
                            },
                          })
                        }
                        onOpenProfile={() => handleChangeTab("profile")}
                      />
                    </div>
                  ) : activeTab === "watchlist" ? (
                    <div className="px-4 pb-[140px] pt-2">
                      <CareerCompanyWatchlistPanel />
                    </div>
                  ) : (
                    <div className="px-4 pb-[140px] pt-2">
                      <CareerProfileWorkspace
                        view={activeTab === "brief" ? "brief" : "profile"}
                        onDetailOpen={closeChatForDocument}
                      />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </CareerMobileShell>
            <CareerMobileChatLauncher
              navigation={{
                activeTab,
                onChangeTab: handleTopBarOptionChange,
                options: workspaceTabOptions,
              }}
              open={chatOpen}
              onOpenChange={setChatOpen}
            >
              <CareerChatPanel
                pendingAction={pendingChatAction}
                onPendingActionHandled={clearPendingChatAction}
              />
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
    </CareerMobileChatLauncherVisibilityProvider>
  );
};
