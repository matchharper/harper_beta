"use client";

import React, { useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X, AudioLines, MessageCircle, Mic, MicOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerMobileChatNotice } from "@/hooks/career/useCareerMobileChatNotice";

type CareerMobileChatLauncherProps = {
  children: React.ReactNode;
  actionBar?: React.ReactNode;
  topOffsetPx?: number;
  placeholder?: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const DEFAULT_TOP_OFFSET_PX = 56;
const SWIPE_UP_THRESHOLD_PX = 24;

export default function CareerMobileChatLauncher({
  children,
  actionBar,
  topOffsetPx = DEFAULT_TOP_OFFSET_PX,
  placeholder = "Harper에게 답변을 입력하세요.",
  className,
  open: controlledOpen,
  onOpenChange,
}: CareerMobileChatLauncherProps) {
  const logCareerEvent = useCareerLogEvent();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const touchStartYRef = useRef<number | null>(null);

  const {
    callConnectionStatus,
    messages,
    voiceMuted,
    onToggleVoiceMute,
    onEndCallMode,
  } = useCareerChatPanelContext();
  const isCallActive =
    callConnectionStatus === "connected" ||
    callConnectionStatus === "reconnecting";
  const showMinimizedCall = isCallActive && !open;
  const chatNotice = useCareerMobileChatNotice({
    messages,
    open,
  });

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
      <div
        role="presentation"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 flex flex-col border-t border-beige900/10 bg-beige50",
          className
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-beige900/20" />
        </div>
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
              className="mx-4 mb-2 flex min-h-11 items-center gap-2 rounded-full border border-beige900/10 bg-white px-3 py-2 text-left text-sm text-beige900 shadow-md transition active:scale-[0.99]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-beige900 text-beige50">
                <MessageCircle className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 font-medium leading-5">
                Harper가 답했어요
              </span>
              <span className="shrink-0 text-[12px] font-medium text-beige900/45">
                열기
              </span>
            </motion.button>
          ) : null}
        </AnimatePresence>
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
              <div className="flex items-center gap-2 rounded-full bg-beige900/5 px-3 py-2">
                <button
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
                      ? "bg-beige900/15 text-beige900/50"
                      : "bg-white text-beige900"
                  )}
                  aria-label={voiceMuted ? "음소거 해제" : "음소거"}
                >
                  {voiceMuted ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    logCareerEvent("click_mobile_call_end");
                    onEndCallMode?.();
                  }}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition-opacity hover:opacity-90"
                  aria-label="통화 종료"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openDrawer}
              className={cn(
                "flex h-12 flex-1 items-center justify-between rounded-full border border-beige900/10 bg-white px-4 text-left text-sm text-beige900/45 transition active:bg-beige100",
                chatNotice.hasUnread &&
                  "border-accentBronze/45 text-beige900 shadow-sm"
              )}
            >
              <span>{placeholder}</span>
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <AudioLines className="h-5 w-5 text-beige900/60" />
                {chatNotice.hasUnread ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-accentBronze" />
                ) : null}
              </span>
            </button>
          )}
        </div>
      </div>

      <DrawerPrimitive.Root
        open={open}
        onOpenChange={handleOpenChange}
        shouldScaleBackground={false}
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay
            className="fixed inset-0 z-40 bg-beige900/20 backdrop-blur-[2px]"
            style={{
              top: `calc(env(safe-area-inset-top) + ${topOffsetPx}px)`,
            }}
          />
          <DrawerPrimitive.Content
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col border-t border-beige900/10 bg-beige50 text-beige900 outline-none"
            style={{
              height: `calc(100svh - ${topOffsetPx}px - env(safe-area-inset-top))`,
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            <DrawerPrimitive.Title className="sr-only">
              Harper 채팅
            </DrawerPrimitive.Title>
            <DrawerPrimitive.Description className="sr-only">
              아래로 드래그하거나 닫기 버튼을 눌러 접을 수 있습니다.
            </DrawerPrimitive.Description>

            <div className="relative flex shrink-0 items-center justify-center px-4 pt-3 pb-2">
              <div className="h-1.5 w-12 rounded-full bg-beige900/15" />
              <DrawerPrimitive.Close
                aria-label="채팅 접기"
                className="absolute right-3 top-2 z-[60] inline-flex h-9 w-9 items-center justify-center rounded-full border border-beige900/10 bg-white text-beige900/70 shadow-[0_4px_12px_rgba(46,23,6,0.06)] transition active:bg-beige100"
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
