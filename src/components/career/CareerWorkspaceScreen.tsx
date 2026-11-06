import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/router";
import CareerChatPanel from "./CareerChatPanel";
import { useCareerChatActivityContext } from "./CareerChatPanelContext";
import CareerHistoryPanel from "./CareerHistoryPanel";
import CareerTasksPanel from "./CareerTasksPanel";
import CareerProfileWorkspace from "./profile/CareerProfileWorkspace";
import CareerCompanyWatchlistPanel from "./watchlist/CareerCompanyWatchlistPanel";
import CareerWorkspaceNav, {
  type CareerWorkspaceTab,
} from "./CareerWorkspaceNav";
import { useCareerHistoryContext } from "./CareerSidebarContext";
import { useCareerContentSuggestions } from "@/hooks/career/useCareerContentSuggestions";
import {
  CareerWorkspaceNavigationContext,
  type CareerWorkspaceNavigationOptions,
} from "./CareerWorkspaceNavigationContext";
import { DocumentEditorPanelProvider } from "@/components/ui/document-editor";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import type { CareerComposerPendingAction } from "@/lib/career/pendingActions";
type ScreenProps = {
  activeTab?: CareerWorkspaceTab;
  historyContent?: React.ReactNode;
  children?: React.ReactNode;
  fillParent?: boolean;
  forcedViewport?: "desktop" | "mobile";
  initialMobileChatOpen?: boolean;
  onChangeTab?: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
};

export const CareerLoadingState = () => {
  const t = useCareerT();
  return (
    <main
      className="career-sky-canvas flex min-h-svh items-center justify-center"
      aria-busy="true"
    >
      <Loader2 className="size-5 animate-spin text-neutral-soft" />
      <span className="sr-only">
        {t(
          "career.common.career_workspace_screen.1nwthrd",
          "커리어 페이지 로딩 중"
        )}
      </span>
    </main>
  );
};
export const CareerWorkspace = () => <CareerWorkspaceRoot />;

function CareerWorkspaceRoot({
  activeTab: controlledTab,
  historyContent,
  fillParent,
  forcedViewport,
  initialMobileChatOpen = false,
  onChangeTab,
}: ScreenProps) {
  const t = useCareerT();
  const router = useRouter();
  const detectedMobile = useIsMobile();
  const mobile = forcedViewport ? forcedViewport === "mobile" : detectedMobile;
  const { inputMode } = useCareerChatActivityContext();
  const { historyOpportunityCounts } = useCareerHistoryContext();
  const contentSuggestions = useCareerContentSuggestions();
  const [localTab, setLocalTab] = useState<CareerWorkspaceTab>(
    initialMobileChatOpen ? "chat" : "home"
  );
  const [pendingAction, setPendingAction] =
    useState<CareerComposerPendingAction | null>(null);
  const activeTab = controlledTab ?? localTab;
  const isHome = activeTab === "home" || activeTab === "tasks";
  const isConversation = isHome || activeTab === "chat";
  const isDetail = !isConversation && activeTab !== "history";
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useCallback(
    (tab: CareerWorkspaceTab, options?: CareerWorkspaceNavigationOptions) => {
      if (onChangeTab) onChangeTab(tab, options);
      else setLocalTab(tab);
    },
    [onChangeTab]
  );
  const focusComposer = useCallback(() => {
    requestAnimationFrame(() =>
      document.getElementById("career-chat-composer")?.focus()
    );
  }, []);
  const openChat = useCallback(() => {
    if (mobile) navigate("chat");
    focusComposer();
  }, [focusComposer, mobile, navigate]);
  const openChatAction = useCallback(
    (action: CareerComposerPendingAction) => {
      setPendingAction(action);
      openChat();
    },
    [openChat]
  );
  const clearPendingAction = useCallback(() => setPendingAction(null), []);
  const navContext = useMemo(
    () => ({ openChat, openChatAction, navigate }),
    [openChat, openChatAction, navigate]
  );
  const scrollToTop = useCallback(
    () => scrollRef.current?.scrollTo({ top: 0 }),
    []
  );
  useEffect(() => {
    scrollToTop();
  }, [activeTab, scrollToTop]);
  // Preserve entry links used by onboarding, email and explicit call/chat starts.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!mobile || autoOpened.current) return;
    if (
      initialMobileChatOpen ||
      router.query.start === "chat" ||
      router.query.start === "call"
    ) {
      autoOpened.current = true;
      navigate("chat");
    }
  }, [mobile, initialMobileChatOpen, router.query.start, navigate]);

  const followups = (
    <CareerTasksPanel
      showTitle={false}
      onOpenChat={openChat}
      onOpenChatAction={openChatAction}
      onOpenOpportunity={(roleId, historyTab, savedStage) =>
        navigate("history", {
          historyTarget: { roleId, historyTab, savedStage },
        })
      }
      onOpenProfile={() => navigate("profile")}
    />
  );
  const detailTitle =
    activeTab === "documents"
      ? t("career.sky.documents", "자료")
      : activeTab === "brief"
        ? t(
            "career.profile.career_profile_workspace.search_brief_tab",
            "원하는 조건"
          )
        : activeTab === "watchlist"
          ? t("career.sky.companies", "관심 회사")
          : t("career.workspace.my_information", "내 정보");

  return (
    <CareerWorkspaceNavigationContext.Provider value={navContext}>
      <div
        className={cn(
          "career-workspace career-sky-canvas",
          fillParent && "!h-full"
        )}
        data-career-theme="sky"
      >
        <CareerWorkspaceNav
          activeTab={activeTab}
          isMobile={mobile}
          opportunityCount={historyOpportunityCounts.new}
          homeCount={contentSuggestions.newCount}
          onChangeTab={(tab) => navigate(tab)}
        />
        <div
          className="career-workspace-body"
          data-panel={
            activeTab === "history"
              ? "history"
              : isDetail
                ? "detail"
                : "followups"
          }
          data-call={inputMode === "call" ? "true" : undefined}
        >
          <section
            id="career-chat-panel"
            className="career-chat-column"
            hidden={mobile && !isConversation}
            aria-label={t("career.sky.chat", "채팅")}
          >
            <CareerChatPanel
              pendingAction={pendingAction}
              onPendingActionHandled={clearPendingAction}
              homeContent={mobile && isHome ? followups : undefined}
              onMessageSubmit={openChat}
            />
          </section>
          <section
            id="career-right-panel"
            className="career-right-column"
            hidden={mobile && isConversation}
            aria-label={
              isConversation
                ? t("career.sky.followups", "지금 팔로업")
                : activeTab === "history"
                  ? t("career.workspace.opportunities", "기회")
                  : detailTitle
            }
          >
            <DocumentEditorPanelProvider onOpenDocument={scrollToTop}>
              <div ref={scrollRef} className="career-right-scroll no-scrollbar">
                {!isConversation && (
                  <header className="career-panel-heading">
                    <h1>
                      {activeTab === "history"
                        ? t("career.workspace.opportunities", "기회")
                        : detailTitle}
                    </h1>
                    {isDetail && (
                      <MuteButton
                        variant="transparent"
                        aria-label={t(
                          "career.sky.back_to_chat",
                          "채팅으로 돌아가기"
                        )}
                        onClick={() => navigate("chat")}
                      >
                        <ArrowLeft className="size-4" />
                      </MuteButton>
                    )}
                  </header>
                )}

                {isConversation ? (
                  !mobile && followups
                ) : activeTab === "history" ? (
                  (historyContent ?? <CareerHistoryPanel />)
                ) : activeTab === "watchlist" ? (
                  <CareerCompanyWatchlistPanel />
                ) : (
                  <CareerProfileWorkspace
                    onChangeView={navigate}
                    view={
                      activeTab === "documents"
                        ? "documents"
                        : activeTab === "brief"
                          ? "brief"
                          : "profile"
                    }
                    onDetailOpen={scrollToTop}
                  />
                )}
              </div>
            </DocumentEditorPanelProvider>
          </section>
        </div>
      </div>
    </CareerWorkspaceNavigationContext.Provider>
  );
}

function CareerWorkspaceScreen({ children, ...props }: ScreenProps) {
  return (
    <main className="relative w-full text-neutral-primary">
      {children ?? <CareerWorkspaceRoot {...props} />}
    </main>
  );
}
export default React.memo(CareerWorkspaceScreen);
