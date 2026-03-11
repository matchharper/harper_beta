import React, { useCallback, useEffect, useRef, useState } from "react";
import CareerChatPanel from "@/components/career/CareerChatPanel";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { CareerFlowProvider } from "@/components/career/CareerFlowProvider";
import CareerProgressSidebar from "@/components/career/CareerProgressSidebar";
import CareerSettingsModal from "@/components/career/CareerSettingsModal";
import { Loader2, MessageCircle, Send, SettingsIcon } from "lucide-react";

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
      <div className="font-hedvig text-hblack700">Harper</div>
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
  const {
    user,
    stage,
    authLoading,
    authPending,
    authError,
    authInfo,
    onGoogleLogin,
  } = useCareerChatPanelContext();
  const showAuthModal = authLoading || !user;
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

  if (!showAuthModal) {
    return (
      <div className="relative mx-auto flex h-screen px-2 flex-col py-4 lg:py-6 lg:pt-12">
        <div
          ref={layoutRef}
          className="flex min-h-0 flex-1 flex-col gap-8 lg:flex-row lg:gap-0"
        >
          <div
            className={[
              "min-w-0",
              showRightSidebar
                ? "flex-1"
                : "mx-auto flex-1 w-full max-w-[760px]",
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
                    isResizing ? "bg-xprimary/10" : "bg-transparent",
                  ].join(" ")}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="패널 너비 조절"
                >
                  <span className="h-20 w-[2px] rounded-full bg-hblack300 transition-colors group-hover:bg-xprimary" />
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
  }

  return (
    <div className="relative flex min-h-[calc(100vh-48px)] items-center justify-center px-4 py-8">
      <section className="w-full max-w-[560px] rounded-[24px] border border-hblack200 bg-hblack000 px-8 py-6 shadow-[0_4px_12px_rgba(17,24,39,0.06)]">
        <header className="text-center">
          <h1 className="text-lg font-semibold">하퍼에서 기회를 발견하세요.</h1>
          <p className="mt-2 text-base">
            하퍼는 AI/ML/Engineering 인재를 위한 AI Recruiter입니다.
          </p>
        </header>

        <div className="mt-7 space-y-3">
          <article className="rounded-2xl bg-hblack50 px-4 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                <MessageCircle className="h-5 w-5 text-xprimary" />
              </div>
              <div>
                <p className="text-base font-semibold text-hblack1000">
                  대화를 통해 더 나은 매칭
                </p>
                <p className="mt-1 text-sm text-hblack600">
                  하퍼와 대화하세요. 더 많은 정보를 알려줄수록, 더 좋은 기회을
                  얻을 수 있습니다.
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl bg-hblack50 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                <Send className="h-5 w-5 text-xprimary" />
              </div>
              <div>
                <p className="text-base font-semibold text-hblack1000">
                  바로 채용 담당자에게 추천
                </p>
                <p className="mt-1 text-sm text-hblack600">
                  마음에 드는 회사라면, 하퍼가 바로 회사와 연결합니다.
                  <br />
                  자기소개서는 필요 없습니다.
                </p>
              </div>
            </div>
          </article>
        </div>

        <div className="mt-10 flex flex-col items-center">
          <button
            type="button"
            onClick={() => void onGoogleLogin()}
            disabled={authLoading || authPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-xprimary bg-xprimary px-5 text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {authLoading || authPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {authLoading ? "로그인 확인 중..." : "처리 중..."}
              </>
            ) : (
              "Google 로그인"
            )}
          </button>
          <p className="mt-3 text-sm text-hblack600 mb-1">
            첫 가입시, 전체 과정은 5분도 걸리지 않습니다.
          </p>
        </div>

        {authError ? (
          <p className="mt-4 rounded-lg border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
            {authError}
          </p>
        ) : null}
        {authInfo ? (
          <p className="mt-3 rounded-lg border border-hblack200 bg-hblack100 px-3 py-2 text-sm text-hblack700">
            {authInfo}
          </p>
        ) : null}
      </section>
    </div>
  );
};

const Career = () => {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  return (
    <main
      className="relative min-h-screen text-hblack900 font-inter bg-hblack000 w-full 
            bg-[linear-gradient(60deg,#f3f4f6_1px,transparent_1px)] 
            bg-[size:40px_40px] bg-red-200"
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
