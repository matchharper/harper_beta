"use client";

import React, { useEffect, useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import {
  X,
  AudioLines,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Mic,
  MicOff,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  useCareerCallContext,
  useCareerChatPanelContext,
} from "@/components/career/CareerChatPanelContext";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerMobileChatNotice } from "@/hooks/career/useCareerMobileChatNotice";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerMobileChatLauncherVisibility } from "@/components/career/mobile/CareerMobileChatLauncherVisibilityContext";

type CareerMobileChatLauncherProps = {
  children: React.ReactNode;
  actionBar?: React.ReactNode;
  placeholder?: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const SWIPE_UP_THRESHOLD_PX = 24;
const KEYBOARD_OPEN_THRESHOLD_PX = 80;

function readVisualViewportSnapshot() {
  if (typeof window === "undefined") {
    return {
      height: 0,
      offsetTop: 0,
      bottomInset: 0,
    };
  }

  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const bottomInset = Math.max(window.innerHeight - height - offsetTop, 0);

  return {
    height,
    offsetTop,
    bottomInset,
  };
}

function useMobileChatViewport(open: boolean) {
  const maxViewportHeightRef = useRef(0);
  const keyboardOpenRef = useRef(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;

    const root = document.documentElement;
    let animationFrame = 0;

    const updateViewportVars = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const { height, offsetTop, bottomInset } = readVisualViewportSnapshot();
        maxViewportHeightRef.current = Math.max(
          maxViewportHeightRef.current,
          height
        );

        const heightDelta = Math.max(maxViewportHeightRef.current - height, 0);
        const keyboardOpen =
          bottomInset > KEYBOARD_OPEN_THRESHOLD_PX ||
          heightDelta > KEYBOARD_OPEN_THRESHOLD_PX;
        const drawerViewportTop = keyboardOpen ? 0 : offsetTop;
        const drawerViewportHeight = keyboardOpen ? height + offsetTop : height;

        if (keyboardOpenRef.current !== keyboardOpen) {
          keyboardOpenRef.current = keyboardOpen;
          setKeyboardOpen(keyboardOpen);
        }

        root.style.setProperty(
          "--career-mobile-chat-viewport-height",
          `${drawerViewportHeight}px`
        );
        root.style.setProperty(
          "--career-mobile-chat-viewport-top",
          `${drawerViewportTop}px`
        );
        root.style.setProperty(
          "--career-mobile-chat-safe-bottom",
          keyboardOpen ? "0px" : "env(safe-area-inset-bottom)"
        );
      });
    };

    const resetViewportBaseline = () => {
      maxViewportHeightRef.current = 0;
      updateViewportVars();
    };

    resetViewportBaseline();
    window.addEventListener("resize", updateViewportVars);
    window.addEventListener("orientationchange", resetViewportBaseline);
    window.visualViewport?.addEventListener("resize", updateViewportVars);
    window.visualViewport?.addEventListener("scroll", updateViewportVars);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateViewportVars);
      window.removeEventListener("orientationchange", resetViewportBaseline);
      window.visualViewport?.removeEventListener("resize", updateViewportVars);
      window.visualViewport?.removeEventListener("scroll", updateViewportVars);
      root.style.removeProperty("--career-mobile-chat-viewport-height");
      root.style.removeProperty("--career-mobile-chat-viewport-top");
      root.style.removeProperty("--career-mobile-chat-safe-bottom");
      maxViewportHeightRef.current = 0;
      keyboardOpenRef.current = false;
      setKeyboardOpen(false);
    };
  }, [open]);

  return keyboardOpen;
}

function CareerMobileChatLauncher({
  children,
  actionBar,
  placeholder,
  className,
  open: controlledOpen,
  onOpenChange,
}: CareerMobileChatLauncherProps) {
  const t = useCareerT();

  const logCareerEvent = useCareerLogEvent();
  const { isChatLauncherHidden } = useCareerMobileChatLauncherVisibility();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const requestedOpen = isControlled ? controlledOpen : internalOpen;
  const open = requestedOpen && !isChatLauncherHidden;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const touchStartYRef = useRef<number | null>(null);
  const keyboardOpen = useMobileChatViewport(open);

  const {
    activeThinkingLogs,
    assistantTyping,
    callWrapUpPending,
    chatPending,
    conversationId,
    isOnboardingDone,
    messages,
    onboardingWrapupPending,
    opportunityFeedbackFollowUpPending,
    sessionPending,
    sessionReengagementPending,
    stage,
  } = useCareerChatPanelContext();
  const { callConnectionStatus, voiceMuted, onToggleVoiceMute, onEndCallMode } =
    useCareerCallContext();
  const isCallActive =
    callConnectionStatus === "connected" ||
    callConnectionStatus === "reconnecting";
  const showMinimizedCall = isCallActive && !open;
  const chatNotice = useCareerMobileChatNotice({
    conversationId,
    messages,
    open,
    ready: !sessionPending && Boolean(conversationId),
  });
  const harperPreparing =
    !open &&
    !showMinimizedCall &&
    (chatPending ||
      assistantTyping ||
      activeThinkingLogs.length > 0 ||
      sessionReengagementPending ||
      opportunityFeedbackFollowUpPending ||
      onboardingWrapupPending ||
      callWrapUpPending);
  const resolvedPlaceholder =
    placeholder ??
    t(
      "career.chat.career_composer_section.0e686ow",
      "새로운 조건이나 궁금한 점을 남겨주세요"
    );
  const launcherPlaceholder = harperPreparing
    ? t(
        "career.common.career_mobile_chat_launcher.0hu1shh",
        "Harper가 답변을 준비하고 있습니다..."
      )
    : resolvedPlaceholder;
  const showChatInterviewCta =
    !harperPreparing && stage === "chat" && !isOnboardingDone;
  const chatInterviewCtaLabel = t(
    "career.common.career_mobile_chat_launcher.chat_interview_cta",
    "채팅으로 5분 커리어 인터뷰를 완료하세요"
  );

  const openDrawer = () => {
    logCareerEvent("click_mobile_chat_launcher_open");
    chatNotice.markRead();
    setOpen(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      chatNotice.markRead();
    }
    setOpen(nextOpen);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };
  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartYRef.current;
    if (start === null) return;
    const current = event.touches[0]?.clientY;
    if (current === undefined) return;
    if (start - current > SWIPE_UP_THRESHOLD_PX) {
      touchStartYRef.current = null;
      logCareerEvent("click_mobile_chat_launcher_swipe_open");
      chatNotice.markRead();
      setOpen(true);
    }
  };
  const handleTouchEnd = () => {
    touchStartYRef.current = null;
  };

  return (
    <>
      <motion.div
        initial={false}
        animate={{
          opacity: isChatLauncherHidden ? 0 : 1,
          y: isChatLauncherHidden ? "100%" : "0%",
        }}
        onAnimationStart={() => {
          if (isChatLauncherHidden && requestedOpen) setOpen(false);
        }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden={isChatLauncherHidden}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 flex flex-col",
          isChatLauncherHidden && "pointer-events-none",
          className
        )}
      >
        <AnimatePresence initial={false}>
          {chatNotice.showPrompt && !showMinimizedCall ? (
            <motion.button
              type="button"
              key="mobile-chat-notice"
              onClick={openDrawer}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="mx-4 mb-2 flex min-h-10 items-center gap-2 rounded-full border border-neutral-1000-a05 bg-bg-floating/90 px-4 py-2 text-left text-[13px] text-neutral-primary backdrop-blur-md transition active:scale-[0.99]"
            >
              <MessageCircle className="h-3 w-3 text-neutral-primary" />
              <span className="min-w-0 flex-1 font-normal leading-5">
                {t(
                  "career.common.career_mobile_chat_launcher.0q9yygi",
                  "Harper가 답했어요"
                )}
              </span>
              <span className="shrink-0 text-[12px] font-normal text-neutral-soft">
                {t("career.common.career_mobile_chat_launcher.0pnsgrt", "열기")}
              </span>
            </motion.button>
          ) : null}
        </AnimatePresence>

        <div
          role="presentation"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex flex-col border-t border-neutral-1000-a05 bg-bg-floating"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-black/20" />
          </div>
          {actionBar && !showMinimizedCall ? (
            <div className="px-4 pt-1 pb-2">{actionBar}</div>
          ) : null}
          <div className="flex items-center gap-2 px-4 pb-3 pt-1">
            {showMinimizedCall ? (
              <div
                className="flex w-full items-center justify-center"
                onTouchStart={(event) => event.stopPropagation()}
                onTouchMove={(event) => event.stopPropagation()}
              >
                <div className="flex items-center gap-2 rounded-full bg-black/5 px-3 py-2">
                  <BareButton
                    type="button"
                    onClick={() => {
                      logCareerEvent(
                        voiceMuted
                          ? "click_mobile_call_unmute"
                          : "click_mobile_call_mute"
                      );
                      onToggleVoiceMute();
                    }}
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                      voiceMuted
                        ? "bg-black/15 text-neutral-soft"
                        : "bg-bg-floating text-neutral-primary"
                    )}
                    aria-label={voiceMuted ? "음소거 해제" : "음소거"}
                  >
                    {voiceMuted ? (
                      <MicOff className="h-5 w-5" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </BareButton>
                  <BareButton
                    type="button"
                    onClick={() => {
                      logCareerEvent("click_mobile_call_end");
                      onEndCallMode?.();
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-critical text-neutral-00 transition-opacity hover:opacity-90"
                    aria-label={"통화 종료"}
                  >
                    <X className="h-5 w-5" />
                  </BareButton>
                </div>
              </div>
            ) : (
              <>
                {showChatInterviewCta ? (
                  <BareButton
                    type="button"
                    onClick={openDrawer}
                    className={cn(
                      "flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-black bg-black px-4 text-center text-[13px] font-normal text-neutral-00 shadow-[0_12px_28px_rgba(0,0,0,0.1)] transition active:scale-[0.99]",
                      chatNotice.hasUnread && "ring-2 ring-primary/35"
                    )}
                    aria-label={chatInterviewCtaLabel}
                  >
                    <span className="min-w-0 whitespace-normal leading-5">
                      {chatInterviewCtaLabel}
                    </span>
                  </BareButton>
                ) : (
                  <BareButton
                    type="button"
                    onClick={openDrawer}
                    className={cn(
                      "flex h-12 flex-1 items-center justify-between rounded-full border border-neutral-1000-a05 bg-bg-floating px-4 text-left text-sm text-neutral-soft transition active:bg-bg-weak",
                      harperPreparing &&
                        "border-primary/20 bg-primary/5 text-neutral-primary shadow-[0_8px_24px_rgba(31,28,26,0.06)]",
                      chatNotice.hasUnread &&
                        "border-primary/40 text-neutral-primary"
                    )}
                  >
                    <span>{launcherPlaceholder}</span>
                    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                      {harperPreparing ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <AudioLines className="h-5 w-5 text-neutral-muted" />
                      )}
                      {chatNotice.hasUnread ? (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-bg-default bg-primary" />
                      ) : null}
                    </span>
                  </BareButton>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>

      <DrawerPrimitive.Root
        open={open}
        onOpenChange={handleOpenChange}
        handleOnly={keyboardOpen}
        repositionInputs={false}
        shouldScaleBackground={false}
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            style={{
              top: "var(--career-mobile-chat-viewport-top, 0px)",
            }}
          />
          <DrawerPrimitive.Content
            className="fixed inset-x-0 z-50 flex flex-col border-t border-neutral-1000-a05 bg-bg-floating text-neutral-primary outline-none"
            style={{
              top: "var(--career-mobile-chat-viewport-top, 0px)",
              height: "var(--career-mobile-chat-viewport-height, 100svh)",
              paddingBottom:
                "var(--career-mobile-chat-safe-bottom, env(safe-area-inset-bottom))",
            }}
          >
            <DrawerPrimitive.Title className="sr-only">
              {t(
                "career.common.career_mobile_chat_launcher.1j1ugk2",
                "Harper 채팅"
              )}
            </DrawerPrimitive.Title>
            <DrawerPrimitive.Description className="sr-only">
              {t(
                "career.common.career_mobile_chat_launcher.1bjhre2",
                "아래로 드래그하거나 닫기 버튼을 눌러 접을 수 있습니다."
              )}
            </DrawerPrimitive.Description>

            <div
              className="relative flex shrink-0 items-center justify-center px-4 pb-2"
              style={{
                paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)",
              }}
            >
              <DrawerPrimitive.Handle
                preventCycle
                className="flex h-6 w-24 items-center justify-center"
              >
                <div className="h-1.5 w-12 rounded-full bg-black/15" />
              </DrawerPrimitive.Handle>
              <DrawerPrimitive.Close
                aria-label={"채팅 접기"}
                className="absolute right-3 top-2 z-[60] inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-1000-a05 bg-bg-floating text-neutral-muted transition active:bg-bg-weak"
                style={{
                  top: "calc(env(safe-area-inset-top) + 0.5rem)",
                }}
              >
                <X className="h-4 w-4" />
              </DrawerPrimitive.Close>
            </div>

            <div className="flex-1 overflow-hidden">{children}</div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    </>
  );
}

export default React.memo(CareerMobileChatLauncher);
