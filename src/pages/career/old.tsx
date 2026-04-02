import React, { useCallback, useEffect, useRef, useState } from "react";
import CareerChatPanel from "@/components/career/CareerChatPanel";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { CareerFlowProvider } from "@/components/career/CareerFlowProvider";
import CareerOnboardingChecklist from "@/components/career/CareerOnboardingChecklist";
import CareerProgressSidebar from "@/components/career/CareerProgressSidebar";
import CareerSettingsModal from "@/components/career/CareerSettingsModal";
import { useAuthStore } from "@/store/useAuthStore";
import { Loader2, SettingsIcon } from "lucide-react";
import { useRouter } from "next/router";

const MIN_CHAT_PANEL_WIDTH = 560;
const MIN_SIDEBAR_WIDTH = 300;
const MAX_SIDEBAR_WIDTH = 1040;
const DEFAULT_SIDEBAR_WIDTH = 620;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const CareerTopBar = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
  const { user } = useCareerChatPanelContext();

  return (
    <div className="fixed z-40 flex h-12 w-full items-center justify-between border-b border-hblack100 bg-hblack000">
      <div className="w-1/3" />
      <div className="font-halant text-hblack700">Harper</div>
      <div className="flex w-1/3 items-center justify-end px-4">
        <button
          type="button"
          onClick={onOpenSettings}
          disabled={!user}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack100 text-hblack400 transition-colors hover:border-hblack300 hover:text-hblack700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="커리어 설정 열기"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const CareerLayout = () => {
  const { stage } = useCareerChatPanelContext();
  const showRightSidebar = stage !== "profile";
  const layoutRef = useRef<HTMLDivElement>(null);
  const activeResizeBoundsRef = useRef<{
    rect: DOMRect;
    min: number;
    max: number;
  } | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const getSidebarBounds = useCallback(() => {
    const rect = layoutRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const maxByContainer = rect.width - MIN_CHAT_PANEL_WIDTH;
    const max = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, maxByContainer)
    );
    const min = Math.min(MIN_SIDEBAR_WIDTH, max);

    return { rect, min, max };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(min-width: 1024px)");
    const syncDesktop = () => setIsDesktop(media.matches);
    syncDesktop();

    media.addEventListener("change", syncDesktop);
    return () => media.removeEventListener("change", syncDesktop);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    const bounds = getSidebarBounds();
    if (!bounds) return;
    setSidebarWidth((prev) => clamp(prev, bounds.min, bounds.max));
  }, [getSidebarBounds, isDesktop]);

  useEffect(() => {
    if (typeof window === "undefined" || !isDesktop) return;

    const handleResize = () => {
      const bounds = getSidebarBounds();
      if (!bounds) return;
      setSidebarWidth((prev) => clamp(prev, bounds.min, bounds.max));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getSidebarBounds, isDesktop]);

  useEffect(() => {
    if (!isResizing || typeof document === "undefined") return;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  const updateSidebarWidthFromClientX = useCallback(
    (clientX: number, bounds?: { rect: DOMRect; min: number; max: number }) => {
      const nextBounds = bounds ?? getSidebarBounds();
      if (!nextBounds) return;
      const nextWidth = clamp(
        nextBounds.rect.right - clientX,
        nextBounds.min,
        nextBounds.max
      );
      setSidebarWidth(nextWidth);
    },
    [getSidebarBounds]
  );

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isDesktop) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const bounds = getSidebarBounds();
      if (!bounds) return;

      activeResizeBoundsRef.current = bounds;
      updateSidebarWidthFromClientX(event.clientX, bounds);
      setIsResizing(true);
    },
    [getSidebarBounds, isDesktop, updateSidebarWidthFromClientX]
  );

  const handleResizeMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isDesktop || !isResizing) return;
      const bounds = activeResizeBoundsRef.current ?? undefined;
      updateSidebarWidthFromClientX(event.clientX, bounds);
    },
    [isDesktop, isResizing, updateSidebarWidthFromClientX]
  );

  const handleResizeEnd = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isDesktop) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      activeResizeBoundsRef.current = null;
      setIsResizing(false);
    },
    [isDesktop]
  );

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!isDesktop) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();

      const bounds = getSidebarBounds();
      if (!bounds) return;

      const delta = event.key === "ArrowLeft" ? 24 : -24;
      setSidebarWidth((prev) => clamp(prev + delta, bounds.min, bounds.max));
    },
    [getSidebarBounds, isDesktop]
  );

  return (
    <div className="relative mx-auto flex h-screen px-2 flex-col lg:pt-12">
      <CareerOnboardingChecklist />
      <div
        ref={layoutRef}
        className="relative flex isolate min-h-0 flex-1 flex-col gap-8 lg:flex-row lg:gap-0"
      >
        {/* <div className="absolute top-0 left-0 flex-1 -z-10 h-screen w-full diagonal-lines"></div> */}
        <div
          className={[
            "min-w-0",
            showRightSidebar ? "flex-1" : "mx-auto flex-1 w-full max-w-[760px]",
          ].join(" ")}
        >
          <CareerChatPanel />
        </div>

        {showRightSidebar ? (
          <>
            <div className="hidden lg:flex lg:items-stretch">
              <button
                type="button"
                onPointerDown={handleResizeStart}
                onPointerMove={handleResizeMove}
                onPointerUp={handleResizeEnd}
                onPointerCancel={handleResizeEnd}
                onKeyDown={handleResizeKeyDown}
                className={[
                  "group flex w-3 shrink-0 cursor-col-resize items-center justify-center",
                  isResizing ? "bg-beige900/10" : "bg-transparent",
                ].join(" ")}
                role="separator"
                aria-orientation="vertical"
                aria-label="패널 너비 조절"
              >
                <span className="h-20 w-[2px] rounded-full bg-hblack300 transition-colors group-hover:bg-beige900" />
              </button>
            </div>

            <div
              className="w-full shrink-0 lg:w-auto"
              style={isDesktop ? { width: `${sidebarWidth}px` } : undefined}
            >
              <CareerProgressSidebar />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

const CareerLoadingState = () => (
  <main className="relative flex min-h-screen w-full items-center justify-center bg-hblack000 font-geist text-hblack900">
    <Loader2 className="h-5 w-5 animate-spin text-hblack400" />
    <span className="sr-only">커리어 페이지 로딩 중</span>
  </main>
);

const Career = () => {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  useEffect(() => {
    if (authLoading || user) return;
    void router.replace("/career_login");
  }, [authLoading, router, user]);

  if (authLoading || !user) {
    return <CareerLoadingState />;
  }

  return (
    <main
      className="
      relative min-h-screen text-hblack900 font-geist bg-hblack000 w-full 
      "
    >
      <CareerFlowProvider onOpenSettings={() => setIsSettingsModalOpen(true)}>
        <CareerTopBar onOpenSettings={() => setIsSettingsModalOpen(true)} />
        <CareerLayout />
        <CareerSettingsModal
          open={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      </CareerFlowProvider>
    </main>
  );
};

export default Career;
