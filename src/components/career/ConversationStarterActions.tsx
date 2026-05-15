"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CAREER_CONVERSATION_STARTERS,
  type CareerConversationStarterId,
  type CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";

type ConversationStarterActionsProps = {
  callStartPending?: boolean;
  className?: string;
  disabled?: boolean;
  onStart: (args: {
    mode: CareerConversationStarterMode;
    starterId: CareerConversationStarterId;
  }) => boolean | void | Promise<boolean | void>;
  variant?: "desktop" | "mobile" | "reengagement";
};

type PendingStarterAction = {
  mode: CareerConversationStarterMode;
  starterId: CareerConversationStarterId;
} | null;

export function ConversationStarterActions({
  callStartPending = false,
  className,
  disabled = false,
  onStart,
  variant = "desktop",
}: ConversationStarterActionsProps) {
  const isMobile = variant === "mobile";
  const isReengagement = variant === "reengagement";
  const [pendingAction, setPendingAction] =
    useState<PendingStarterAction>(null);
  const mountedRef = useRef(true);
  const actionDisabled = disabled || callStartPending || pendingAction !== null;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleStart = async (args: NonNullable<PendingStarterAction>) => {
    if (actionDisabled) return;
    setPendingAction(args);
    try {
      await onStart(args);
    } catch (error) {
      console.error("[ConversationStarterActions] failed to start", {
        error: error instanceof Error ? error.message : String(error),
        mode: args.mode,
        starterId: args.starterId,
      });
    } finally {
      if (mountedRef.current) {
        setPendingAction(null);
      }
    }
  };

  return (
    <div
      className={cn(
        isReengagement
          ? "career-reengagement-actions flex flex-wrap gap-2"
          : isMobile
            ? "flex w-full flex-col gap-2"
            : "flex w-full flex-row flex-wrap items-center justify-center gap-4",
        className
      )}
      aria-busy={pendingAction !== null || callStartPending || undefined}
    >
      {CAREER_CONVERSATION_STARTERS.map((starter) => {
        const label = isReengagement ? starter.shortLabel : starter.label;
        const callPending =
          pendingAction?.starterId === starter.id &&
          pendingAction.mode === "call";

        return (
          <button
            key={starter.id}
            type="button"
            onClick={() =>
              void handleStart({ mode: "call", starterId: starter.id })
            }
            disabled={actionDisabled}
            aria-label={`${starter.label} 통화 시작`}
            aria-busy={callPending || undefined}
            className={cn(
              "inline-flex items-center justify-center rounded-3xl border border-beige900/15 bg-white/40 text-center text-beige900 transition-all hover:border-beige900/25 hover:bg-white/65 focus:outline-none focus-visible:ring-4 focus-visible:ring-beige700/20 disabled:cursor-not-allowed disabled:opacity-50",
              isReengagement &&
                "border-beige900/5 bg-hgray900 px-3 py-1.5 text-beige900 hover:bg-hgray800",
              isMobile
                ? "w-full px-4 py-2"
                : isReengagement
                  ? "min-w-0"
                  : "px-4 py-2"
            )}
          >
            <span
              className={cn(
                "min-w-0 text-[14px] font-medium leading-5",
                isReengagement && "text-[12px] leading-4"
              )}
            >
              {callPending ? "연결 중..." : label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
