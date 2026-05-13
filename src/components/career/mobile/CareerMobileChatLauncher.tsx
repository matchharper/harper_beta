"use client";

import React, { useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";

type CareerMobileChatLauncherProps = {
  children: React.ReactNode;
  actionBar?: React.ReactNode;
  topOffsetPx?: number;
  placeholder?: string;
  className?: string;
};

const DEFAULT_TOP_OFFSET_PX = 64;
const SWIPE_UP_THRESHOLD_PX = 24;

export default function CareerMobileChatLauncher({
  children,
  actionBar,
  topOffsetPx = DEFAULT_TOP_OFFSET_PX,
  placeholder = "Harper에게 답변을 입력하세요.",
  className,
}: CareerMobileChatLauncherProps) {
  const [open, setOpen] = useState(false);
  const touchStartYRef = useRef<number | null>(null);

  const openDrawer = () => setOpen(true);

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
        {actionBar ? <div className="px-4 pt-1 pb-2">{actionBar}</div> : null}
        <div className="flex items-center gap-2 px-4 pb-3 pt-1">
          <button
            type="button"
            onClick={openDrawer}
            className="flex h-12 flex-1 items-center justify-between rounded-full border border-beige900/10 bg-white px-4 text-left text-[15px] text-beige900/45 transition active:bg-beige100"
          >
            <span>{placeholder}</span>
            <AudioLines className="h-5 w-5 text-beige900/60" />
          </button>
        </div>
      </div>

      <DrawerPrimitive.Root
        open={open}
        onOpenChange={setOpen}
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
