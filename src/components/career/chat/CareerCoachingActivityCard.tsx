"use client";

import {
  Check,
  Clock3,
  Compass,
  Loader2,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import type { CareerCoachingActivity } from "@/lib/career/careerCoachingActivitySchema";
import { useMessages } from "@/i18n/useMessage";

export type CareerCoachingActivityUiAction =
  | { action: "start"; channel: "chat" | "call" }
  | { action: "end" };

type Props = {
  activity: CareerCoachingActivity;
  disabled?: boolean;
  onAction?: (
    action: CareerCoachingActivityUiAction
  ) => boolean | Promise<boolean>;
};

const COPY = {
  ko: {
    active: "진행 중",
    agenda: "이번 대화에서 함께 볼 내용",
    call: "통화하기",
    chat: "채팅으로 이어하기",
    dismiss: "지금은 괜찮아요",
    end: "이 대화 마치기",
    ended: "종료됨",
    error: "요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
    minutes: (value: number) => `약 ${value}분`,
    reopenCall: "통화 열기",
    suggested: "코칭 제안",
  },
  en: {
    active: "In progress",
    agenda: "What we'll work through",
    call: "Start a call",
    chat: "Continue in chat",
    dismiss: "Not now",
    end: "Finish this conversation",
    ended: "Ended",
    error: "I couldn't send that request. Please try again in a moment.",
    minutes: (value: number) => `About ${value} min`,
    reopenCall: "Open call",
    suggested: "Coaching suggestion",
  },
} as const;

export function CareerCoachingActivityCard({
  activity,
  disabled = false,
  onAction,
}: Props) {
  const { locale } = useMessages();
  const copy = COPY[locale === "en" ? "en" : "ko"];
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const actionDisabled = disabled || Boolean(pendingAction) || !onAction;
  const minutes = activity.plannedMinutes ?? activity.suggestedMinutes;

  const runAction = async (next: CareerCoachingActivityUiAction) => {
    if (actionDisabled) return;
    const key = `${next.action}:${"channel" in next ? next.channel : ""}`;
    setPendingAction(key);
    setError("");
    try {
      const ok = await onAction(next);
      if (ok === false) setError(copy.error);
    } catch {
      setError(copy.error);
    } finally {
      setPendingAction(null);
    }
  };

  const statusCopy = copy[activity.status];

  return (
    <section
      aria-busy={Boolean(pendingAction)}
      className="max-w-[720px] rounded-xl border border-neutral-1000-a10 bg-bg-floating p-4 text-neutral-primary shadow-xs sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-faded text-primary"
          aria-hidden="true"
        >
          <Compass className="size-4" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-6">
              {activity.topic}
            </h3>
            <Badge
              size="sm"
              tone={activity.status === "active" ? "positive" : "neutral"}
              variant={activity.status === "active" ? "faded" : "outline"}
            >
              {statusCopy}
            </Badge>
          </div>
          {minutes ? (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-neutral-muted">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {copy.minutes(minutes)}
            </p>
          ) : null}
          {activity.status === "active" && activity.agenda.length > 0 ? (
            <div className="mt-3">
              <p className="text-[12px] font-medium text-neutral-muted">
                {copy.agenda}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {activity.agenda.map((item, index) => (
                  <li
                    key={`${index}:${item}`}
                    className="flex gap-2 text-[13px] leading-5 text-neutral-primary"
                  >
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {activity.status !== "ended" ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-1000-a05 pt-4">
          {activity.status === "suggested" ? (
            <>
              <MuteButton
                variant="primary"
                disabled={actionDisabled}
                onClick={() =>
                  void runAction({ action: "start", channel: "call" })
                }
              >
                {pendingAction === "start:call" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Phone />
                )}
                {copy.call}
              </MuteButton>
              <MuteButton
                variant="transparent"
                disabled={actionDisabled}
                onClick={() =>
                  void runAction({ action: "start", channel: "chat" })
                }
              >
                {pendingAction === "start:chat" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <MessageCircle />
                )}
                {copy.chat}
              </MuteButton>
              <MuteButton
                variant="transparent"
                disabled={actionDisabled}
                onClick={() => void runAction({ action: "end" })}
              >
                <X />
                {copy.dismiss}
              </MuteButton>
            </>
          ) : (
            <>
              {activity.channel === "call" ? (
                <MuteButton
                  variant="primary"
                  disabled={actionDisabled}
                  onClick={() =>
                    void runAction({ action: "start", channel: "call" })
                  }
                >
                  {pendingAction === "start:call" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Phone />
                  )}
                  {copy.reopenCall}
                </MuteButton>
              ) : null}
              <MuteButton
                variant="transparent"
                disabled={actionDisabled}
                onClick={() => void runAction({ action: "end" })}
              >
                {pendingAction === "end:" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Check />
                )}
                {copy.end}
              </MuteButton>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-[12px] leading-5 text-critical" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
