"use client";

import { Loader2, MessageCircleMore, SlidersHorizontal } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CAREER_CONVERSATION_STARTERS,
  type CareerConversationStarterIcon,
  type CareerConversationStarterId,
  type CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";
import { CareerActionButton } from "./ui/CareerActionButton";

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

const STARTER_ICON_BY_NAME: Record<
  CareerConversationStarterIcon,
  typeof SlidersHorizontal
> = {
  "message-circle-more": MessageCircleMore,
  "sliders-horizontal": SlidersHorizontal,
};

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
            : "flex w-full flex-row flex-wrap items-center justify-center gap-2",
        className
      )}
      aria-busy={pendingAction !== null || callStartPending || undefined}
    >
      {CAREER_CONVERSATION_STARTERS.map((starter) => {
        const label = isReengagement ? starter.shortLabel : starter.label;
        const callPending =
          pendingAction?.starterId === starter.id &&
          pendingAction.mode === "call";
        const StarterIcon = STARTER_ICON_BY_NAME[starter.icon];

        return (
          <CareerActionButton
            key={starter.id}
            onClick={() =>
              void handleStart({ mode: "call", starterId: starter.id })
            }
            disabled={actionDisabled}
            aria-label={`${starter.label} 통화 시작`}
            aria-busy={callPending || undefined}
            actionVariant="secondary"
            className={cn(
              "text-center font-normal",
              isMobile ? "w-full" : isReengagement ? "min-w-0" : "pl-2 pr-4",
              isReengagement && "border-beige900/5 bg-hgray900 hover:bg-hgray800"
            )}
          >
            <span
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-beige900/5 text-beige900/75",
                isReengagement && "h-5 w-5"
              )}
              aria-hidden="true"
            >
              {callPending ? (
                <Loader2
                  className={cn(
                    "h-3.5 w-3.5 animate-spin",
                    isReengagement && "h-3 w-3"
                  )}
                  strokeWidth={1.8}
                />
              ) : (
                <StarterIcon
                  className={cn("h-3.5 w-3.5", isReengagement && "h-3 w-3")}
                  strokeWidth={1.8}
                />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 text-[14px] font-medium leading-5",
                isReengagement && "text-[12px] leading-4"
              )}
            >
              {callPending ? "연결 중..." : label}
            </span>
          </CareerActionButton>
        );
      })}
    </div>
  );
}
