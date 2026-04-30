import { GalleryVerticalEnd, House, Loader2, UserRoundCog } from "lucide-react";
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
import CareerWorkspaceNav, {
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { careerCx } from "@/components/career/ui/CareerPrimitives";
import React from "react";

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";
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
    icon: UserRoundCog,
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
  onChangeTab: (tab: CareerWorkspaceTab) => void;
  onRequestChatFocus: () => void;
}) => {
  if (activeTab === "home") {
    return (
      <CareerCanvas>
        <CareerHomePanel
          onOpenChat={onRequestChatFocus}
          onOpenHistory={() => onChangeTab("history")}
          onOpenProfile={() => onChangeTab("profile")}
        />
      </CareerCanvas>
    );
  }

  if (activeTab === "history") {
    return (
      <CareerCanvas>
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
  onChangeTab?: (tab: CareerWorkspaceTab) => void;
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
  onChangeTab?: (tab: CareerWorkspaceTab) => void;
}) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [activeTabState, setActiveTabState] =
    useState<CareerWorkspaceTab>("home");
  const [isDesktop, setIsDesktop] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(
    CHAT_PANEL_DEFAULT_WIDTH
  );
  const activeTab = controlledActiveTab ?? activeTabState;
  const handleChangeTab = controlledOnChangeTab ?? setActiveTabState;

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
          <div className="min-h-0 flex-1 p-1 bg-beige200">
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
            <div className="min-h-0 flex-1 overflow-y-auto pb-8">
              <nav className="flex items-center justify-center gap-2 overflow-x-auto py-3 border-y border-y-black/5">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeTab;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleChangeTab(item.id)}
                      className={careerCx(
                        "inline-flex items-center gap-2 rounded-full border px-6 py-2 text-sm font-medium transition-all",
                        active
                          ? "border-beige700 bg-white text-beige700"
                          : "text-beige900 hover:bg-beige500 border-transparent"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="mx-auto w-full max-w-[920px]">
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
