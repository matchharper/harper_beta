import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import CareerCallScreen from "./chat/CareerCallScreen";
import CareerCallEnvironmentNotice from "./chat/CareerCallEnvironmentNotice";
import CareerComposerSection from "./chat/CareerComposerSection";
import CareerTimelineSection from "./chat/CareerTimelineSection";
import CareerWelcomeScreen from "./chat/CareerWelcomeScreen";
import { careerCx } from "./ui/CareerPrimitives";
import React from "react";

const CareerCallLoadingScreen = ({
  noticeCollapsed,
  onToggleNotice,
}: {
  noticeCollapsed: boolean;
  onToggleNotice: () => void;
}) => (
  <div className="animate-in fade-in zoom-in-95 absolute inset-0 z-10 flex flex-col items-center justify-center bg-beige50/95 text-beige900 duration-500">
    <div className="absolute inset-x-4 top-4 flex justify-center">
      <CareerCallEnvironmentNotice
        collapsed={noticeCollapsed}
        onToggle={onToggleNotice}
      />
    </div>
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-5"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logos/harper_beige.png"
        alt="Harper"
        className="h-16 w-auto animate-pulse"
      />
      <div className="h-px w-20 bg-beige900/10" />
      <p className="text-sm font-medium text-beige900/55">통화 연결 중...</p>
    </div>
  </div>
);

const CareerChatPanel = () => {
  const router = useRouter();
  const autoStartHandledRef = useRef(false);
  const [isCallNoticeCollapsed, setIsCallNoticeCollapsed] = useState(false);
  const {
    user,
    inputMode,
    messages,
    showVoiceStartPrompt,
    onboardingBeginPending,
    callStartPending = false,
    onStartCallMode,
    onUseChatOnly,
  } = useCareerChatPanelContext();
  const showCallEnvironmentNotice = callStartPending || inputMode === "call";

  const clearStartQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("start");
    void router.replace(`${nextUrl.pathname}${nextUrl.search}`, undefined, {
      shallow: true,
    });
  }, [router]);

  useEffect(() => {
    if (!router.isReady || autoStartHandledRef.current) return;
    if (!user || onboardingBeginPending || !showVoiceStartPrompt) return;

    const startMode =
      router.query.start === "call" || router.query.start === "chat"
        ? router.query.start
        : null;
    if (!startMode) return;

    autoStartHandledRef.current = true;
    clearStartQuery();

    if (startMode === "call" && onStartCallMode) {
      void onStartCallMode();
      return;
    }

    void onUseChatOnly();
  }, [
    clearStartQuery,
    onboardingBeginPending,
    onStartCallMode,
    onUseChatOnly,
    router.isReady,
    router.query.start,
    showVoiceStartPrompt,
    user,
  ]);

  const hasStartedChatConversation = useMemo(
    () =>
      messages.some((message) => {
        const messageType = message.messageType ?? "chat";
        return messageType === "chat" || messageType === "call_wrapup";
      }),
    [messages]
  );
  const showInitialWelcome =
    Boolean(user) &&
    inputMode !== "call" &&
    !hasStartedChatConversation &&
    (showVoiceStartPrompt || onboardingBeginPending);
  const handleToggleCallNotice = useCallback(() => {
    setIsCallNoticeCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    if (showCallEnvironmentNotice) return;
    setIsCallNoticeCollapsed(false);
  }, [showCallEnvironmentNotice]);

  const chatContent = showInitialWelcome ? (
    <CareerWelcomeScreen />
  ) : (
    <>
      <CareerTimelineSection />
      <CareerComposerSection />
    </>
  );

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {inputMode === "call" ? (
        <CareerCallScreen
          noticeCollapsed={isCallNoticeCollapsed}
          onToggleNotice={handleToggleCallNotice}
        />
      ) : (
        <>
          <div
            className={careerCx(
              "flex min-h-0 flex-1 flex-col transition-all duration-500 ease-out",
              callStartPending
                ? "pointer-events-none translate-y-2 scale-[0.985] opacity-0 blur-[2px]"
                : "translate-y-0 scale-100 opacity-100 blur-0"
            )}
          >
            {chatContent}
          </div>
          {callStartPending && (
            <CareerCallLoadingScreen
              noticeCollapsed={isCallNoticeCollapsed}
              onToggleNotice={handleToggleCallNotice}
            />
          )}
        </>
      )}
    </section>
  );
};

export default React.memo(CareerChatPanel);
