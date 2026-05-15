import { useCallback, useMemo, useState } from "react";
import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import CareerCallScreen from "./chat/CareerCallScreen";
import CareerCallEnvironmentNotice from "./chat/CareerCallEnvironmentNotice";
import CareerComposerSection from "./chat/CareerComposerSection";
import CareerTimelineSection from "./chat/CareerTimelineSection";
import CareerWelcomeScreen from "./chat/CareerWelcomeScreen";
import { careerCx } from "./ui/CareerPrimitives";
import { useCareerAutoStart } from "@/hooks/career/useCareerAutoStart";
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

const CallSessionView = ({
  inputMode,
  callStartPending,
}: {
  inputMode: string;
  callStartPending: boolean;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  if (inputMode === "call") {
    return (
      <CareerCallScreen noticeCollapsed={collapsed} onToggleNotice={toggle} />
    );
  }
  if (callStartPending) {
    return (
      <CareerCallLoadingScreen
        noticeCollapsed={collapsed}
        onToggleNotice={toggle}
      />
    );
  }
  return null;
};

const CareerChatPanel = () => {
  const {
    user,
    inputMode,
    messages,
    isOnboardingDone,
    showVoiceStartPrompt,
    onboardingBeginPending,
    callStartPending = false,
    onStartCallMode,
    onUseChatOnly,
  } = useCareerChatPanelContext();

  useCareerAutoStart({
    user,
    onboardingBeginPending,
    showVoiceStartPrompt,
    onStartCallMode,
    onUseChatOnly,
  });

  const hasConversationActivity = useMemo(
    () =>
      messages.some((message) => {
        const messageType = message.messageType ?? "chat";
        return messageType !== "profile_submit";
      }),
    [messages]
  );
  const showInitialWelcome =
    Boolean(user) &&
    inputMode !== "call" &&
    !isOnboardingDone &&
    !hasConversationActivity &&
    showVoiceStartPrompt;

  const chatContent = showInitialWelcome ? (
    <CareerWelcomeScreen />
  ) : (
    <>
      <CareerTimelineSection />
      <CareerComposerSection />
    </>
  );

  const callSessionActive = callStartPending || inputMode === "call";

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {inputMode !== "call" && (
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
      )}
      {callSessionActive && (
        <CallSessionView
          inputMode={inputMode}
          callStartPending={callStartPending}
        />
      )}
    </section>
  );
};

export default React.memo(CareerChatPanel);
