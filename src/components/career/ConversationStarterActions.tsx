"use client";

import {
  BriefcaseBusiness,
  Loader2,
  MessageCircleMore,
  SlidersHorizontal,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  type CareerConversationStarterId,
  type CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import { ActionButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

type ConversationStarterActionsProps = {
  callStartPending?: boolean;
  className?: string;
  disabled?: boolean;
  onStart: (args: {
    mode: CareerConversationStarterMode;
    starterId: CareerConversationStarterId;
  }) => boolean | void | Promise<boolean | void>;
  onRequestMoreOpenPositions?: () => boolean | void | Promise<boolean | void>;
  variant?: "desktop" | "mobile" | "reengagement";
};

type PendingAction =
  | {
      kind: "conversation_starter";
      mode: CareerConversationStarterMode;
      starterId: CareerConversationStarterId;
    }
  | {
      kind: "open_position_recommendation_request";
    }
  | null;

type ConversationStarterIcon = "sliders-horizontal" | "message-circle-more";

type ConversationStarterAction = {
  id: CareerConversationStarterId;
  icon: ConversationStarterIcon;
};

const CONVERSATION_STARTER_ACTIONS: ConversationStarterAction[] = [
  {
    id: "preference_update",
    icon: "sliders-horizontal",
  },
  {
    id: "match_quality",
    icon: "message-circle-more",
  },
];

const STARTER_ICON_BY_NAME: Record<
  ConversationStarterIcon,
  typeof SlidersHorizontal
> = {
  "message-circle-more": MessageCircleMore,
  "sliders-horizontal": SlidersHorizontal,
};

type CareerT = ReturnType<typeof useCareerT>;

function getStarterDisplayCopy(
  t: CareerT,
  starterId: CareerConversationStarterId
) {
  if (starterId === "preference_update") {
    return {
      label: t(
        "career.common.conversation_starters.1sfi8z4",
        "선호 조건 업데이트하기"
      ),
      labelKey: "career.common.conversation_starters.1sfi8z4",
      shortLabel: t(
        "career.common.conversation_starters.0o5blh4",
        "선호 조건 업데이트"
      ),
      shortLabelKey: "career.common.conversation_starters.0o5blh4",
    };
  }

  return {
    label: t(
      "career.common.conversation_starters.07qcswd",
      "더 이야기하고 더 좋은 연결 받기"
    ),
    labelKey: "career.common.conversation_starters.07qcswd",
    shortLabel: t(
      "career.common.conversation_starters.1hl3ggw",
      "경험 더 들려주기"
    ),
    shortLabelKey: "career.common.conversation_starters.1hl3ggw",
  };
}

export function ConversationStarterActions({
  callStartPending = false,
  className,
  disabled = false,
  onRequestMoreOpenPositions,
  onStart,
  variant = "desktop",
}: ConversationStarterActionsProps) {
  const t = useCareerT();

  const isMobile = variant === "mobile";
  const isReengagement = variant === "reengagement";
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const mountedRef = useRef(true);
  const actionDisabled = disabled || callStartPending || pendingAction !== null;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleStart = async (args: {
    mode: CareerConversationStarterMode;
    starterId: CareerConversationStarterId;
  }) => {
    if (actionDisabled) return;
    setPendingAction({ kind: "conversation_starter", ...args });
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

  const handleRequestMoreOpenPositions = async () => {
    if (actionDisabled || !onRequestMoreOpenPositions) return;
    setPendingAction({ kind: "open_position_recommendation_request" });
    try {
      await onRequestMoreOpenPositions();
    } catch (error) {
      console.error(
        "[ConversationStarterActions] failed to request more open positions",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    } finally {
      if (mountedRef.current) {
        setPendingAction(null);
      }
    }
  };

  const openPositionRequestPending =
    pendingAction?.kind === "open_position_recommendation_request";
  const openPositionRequestLabel = t(
    "career.common.conversation_starters.more_open_positions",
    "오픈 포지션 더 추천받기"
  );

  return (
    <div
      className={cn(
        isReengagement
          ? "career-reengagement-actions flex flex-wrap gap-2"
          : isMobile
            ? "flex w-full flex-col gap-2"
            : "mx-auto flex w-full max-w-[560px] flex-row flex-wrap items-center justify-center gap-2",
        className
      )}
      aria-busy={pendingAction !== null || callStartPending || undefined}
    >
      {CONVERSATION_STARTER_ACTIONS.map((starter) => {
        const copy = getStarterDisplayCopy(t, starter.id);
        const label = isReengagement ? copy.shortLabel : copy.label;
        const labelKey = isReengagement ? copy.shortLabelKey : copy.labelKey;
        const callPending =
          pendingAction?.kind === "conversation_starter" &&
          pendingAction?.starterId === starter.id &&
          pendingAction.mode === "call";
        const StarterIcon = STARTER_ICON_BY_NAME[starter.icon];

        return (
          <ActionButton
            key={starter.id}
            onClick={() =>
              void handleStart({ mode: "call", starterId: starter.id })
            }
            disabled={actionDisabled}
            aria-label={t(
              "career.chat.conversation_starter_actions.start_call_label",
              "{label} 통화 시작",
              { values: { label: copy.label } }
            )}
            aria-busy={callPending || undefined}
            actionVariant="secondary"
            className={cn(
              "text-center font-normal",
              isMobile ? "w-full" : isReengagement ? "min-w-0" : "pl-2 pr-4",
              isReengagement &&
                "border-neutral-1000-a05 bg-bg-floating hover:bg-bg-weak"
            )}
          >
            <span
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-neutral-muted",
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
              data-career-i18n-key={callPending ? undefined : labelKey}
              className={cn(
                "min-w-0 text-[14px] font-medium leading-5",
                isReengagement && "text-[12px] leading-4"
              )}
            >
              {callPending
                ? t("career.call.career_call_card.1vn8y3k", "연결 중...")
                : label}
            </span>
          </ActionButton>
        );
      })}
      {onRequestMoreOpenPositions ? (
        <ActionButton
          onClick={() => void handleRequestMoreOpenPositions()}
          disabled={actionDisabled}
          aria-label={openPositionRequestLabel}
          aria-busy={openPositionRequestPending || undefined}
          actionVariant="secondary"
          className={cn(
            "text-center font-normal",
            isMobile ? "w-full" : isReengagement ? "min-w-0" : "pl-2 pr-4",
            isReengagement &&
              "border-neutral-1000-a05 bg-bg-floating hover:bg-bg-weak"
          )}
        >
          <span
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-neutral-muted",
              isReengagement && "h-5 w-5"
            )}
            aria-hidden="true"
          >
            {openPositionRequestPending ? (
              <Loader2
                className={cn(
                  "h-3.5 w-3.5 animate-spin",
                  isReengagement && "h-3 w-3"
                )}
                strokeWidth={1.8}
              />
            ) : (
              <BriefcaseBusiness
                className={cn("h-3.5 w-3.5", isReengagement && "h-3 w-3")}
                strokeWidth={1.8}
              />
            )}
          </span>
          <span
            data-career-i18n-key={
              openPositionRequestPending
                ? undefined
                : "career.common.conversation_starters.more_open_positions"
            }
            className={cn(
              "min-w-0 text-[14px] font-medium leading-5",
              isReengagement && "text-[12px] leading-4"
            )}
          >
            {openPositionRequestPending
              ? t(
                  "career.common.conversation_starters.requesting_more_open_positions",
                  "요청 중..."
                )
              : openPositionRequestLabel}
          </span>
        </ActionButton>
      ) : null}
    </div>
  );
}
