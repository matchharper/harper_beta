import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import CareerCallScreen from "./chat/CareerCallScreen";
import CareerCallEnvironmentNotice from "./chat/CareerCallEnvironmentNotice";
import CareerComposerSection, {
  type CareerComposerPendingActionHandler,
} from "./chat/CareerComposerSection";
import CareerTimelineSection from "./chat/CareerTimelineSection";
import CareerWelcomeScreen from "./chat/CareerWelcomeScreen";
import { cn } from "@/lib/utils";
import { useCareerAutoStart } from "@/hooks/career/useCareerAutoStart";
import React from "react";
import { useCareerT } from "@/i18n/useCareerT";
import Face from "../common/Face";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { showToast } from "@/components/toast/toast";
import type { CareerPendingActionOpenTarget } from "@/lib/career/pendingActions";

const DEFAULT_COMPOSER_OVERLAY_HEIGHT_PX = 168;
// Extra empty space after the last timeline item, on top of the composer height.
// Increase this when the final chat should sit farther above the composer.
const TIMELINE_BOTTOM_VISIBLE_GAP_PX = 120;

const CareerCallLoadingScreen = ({
  noticeCollapsed,
  onToggleNotice,
}: {
  noticeCollapsed: boolean;
  onToggleNotice: () => void;
}) => {
  const t = useCareerT();

  return (
    <div className="animate-in fade-in zoom-in-95 absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg-default/95 text-neutral-primary duration-500">
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
        <Face status="closing" className="mt-4" aria-label="Harper" />

        <div className="h-px w-20 bg-neutral-1000-a05" />
        <p className="text-sm font-medium text-neutral-muted">
          {t("career.common.career_chat_panel.1q1egw3", "통화 연결 중...")}
        </p>
      </div>
    </div>
  );
};

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
  const t = useCareerT();
  const router = useRouter();
  const { fetchWithAuth } = useCareerApi();
  const composerOverlayRef = useRef<HTMLDivElement | null>(null);
  const composerPendingActionHandlerRef =
    useRef<CareerComposerPendingActionHandler | null>(null);
  const pendingActionActivationPendingRef = useRef(false);
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(
    DEFAULT_COMPOSER_OVERLAY_HEIGHT_PX
  );
  const [pendingActionActivationPending, setPendingActionActivationPending] =
    useState(false);
  const {
    user,
    inputMode,
    messages,
    sessionPending,
    isOnboardingDone,
    showVoiceStartPrompt,
    emailOnboardingToken,
    onboardingBeginPending,
    callStartPending = false,
    onStartCallMode,
    onUseChatOnly,
    onContinueOnboardingConversation,
  } = useCareerChatPanelContext();

  const autoStartReady = !sessionPending && !isOnboardingDone;

  const handleOpenPendingAction = useCallback(
    async (ref: string) => {
      if (pendingActionActivationPendingRef.current) return;
      pendingActionActivationPendingRef.current = true;
      setPendingActionActivationPending(true);
      try {
        const response = await fetchWithAuth(
          "/api/talent/pending-actions/resolve",
          {
            method: "POST",
            body: JSON.stringify({ ref }),
          }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          target?: CareerPendingActionOpenTarget;
        };
        if (!response.ok || !payload.target) {
          showToast({
            message: t(
              "career.chat.career_composer_section.pending_actions_error_subtext",
              "목록을 불러오지 못했어요. 눌러서 다시 시도해 주세요."
            ),
            variant: "white",
          });
          return;
        }
        if (payload.target.type === "open_path") {
          await router.push(payload.target.path);
          return;
        }
        const pendingActionHandler = composerPendingActionHandlerRef.current;
        if (!pendingActionHandler) {
          throw new Error("Career pending action handler is unavailable");
        }
        pendingActionHandler(payload.target.action);
      } catch {
        showToast({
          message: t(
            "career.chat.career_composer_section.pending_actions_error_subtext",
            "목록을 불러오지 못했어요. 눌러서 다시 시도해 주세요."
          ),
          variant: "white",
        });
      } finally {
        pendingActionActivationPendingRef.current = false;
        setPendingActionActivationPending(false);
      }
    },
    [fetchWithAuth, router, t]
  );

  const handlePendingActionHandlerChange = useCallback(
    (handler: CareerComposerPendingActionHandler | null) => {
      composerPendingActionHandlerRef.current = handler;
    },
    []
  );

  useCareerAutoStart({
    user: autoStartReady ? user : null,
    forceOnboardingStart: autoStartReady && Boolean(emailOnboardingToken),
    onboardingBeginPending,
    showVoiceStartPrompt: autoStartReady && showVoiceStartPrompt,
    onStartCallMode,
    onUseChatOnly,
    onContinueOnboardingConversation,
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
    !sessionPending &&
    !isOnboardingDone &&
    !hasConversationActivity &&
    showVoiceStartPrompt;

  useEffect(() => {
    const element = composerOverlayRef.current;
    if (!element) return;

    let frameId: number | null = null;
    const updateComposerHeight = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const nextHeight = Math.ceil(element.getBoundingClientRect().height);
        if (nextHeight <= 0) return;
        setComposerOverlayHeight((currentHeight) =>
          Math.abs(currentHeight - nextHeight) <= 1 ? currentHeight : nextHeight
        );
      });
    };

    updateComposerHeight();

    const Observer = window.ResizeObserver;
    const observer = Observer ? new Observer(updateComposerHeight) : null;
    observer?.observe(element);
    window.addEventListener("resize", updateComposerHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateComposerHeight);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [inputMode, showInitialWelcome]);

  const chatLayoutStyle = useMemo(
    () =>
      ({
        "--career-composer-height": `${composerOverlayHeight}px`,
        "--career-timeline-bottom-padding": `${
          composerOverlayHeight + TIMELINE_BOTTOM_VISIBLE_GAP_PX
        }px`,
      }) as React.CSSProperties,
    [composerOverlayHeight]
  );

  const chatContent = showInitialWelcome ? (
    <CareerWelcomeScreen />
  ) : (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      style={chatLayoutStyle}
    >
      <CareerTimelineSection
        onOpenPendingAction={handleOpenPendingAction}
        pendingActionActivationPending={pendingActionActivationPending}
      />
      <div
        ref={composerOverlayRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-bg-basement via-bg-basement/10 to-transparent"
      >
        <div className="pointer-events-auto">
          <CareerComposerSection
            onPendingActionHandlerChange={handlePendingActionHandlerChange}
          />
        </div>
      </div>
    </div>
  );

  const callSessionActive = callStartPending || inputMode === "call";

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {inputMode !== "call" && (
        <div
          className={cn(
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
