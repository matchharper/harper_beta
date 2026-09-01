import { Loader2, Phone, PhoneCall, PhoneOff, Square } from "lucide-react";
import { useId, type ReactNode } from "react";
import { ActionButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";

type CareerCallCardProps = {
  callDisabled: boolean;
  callStartPending: boolean;
  ctaLabel?: string;
  className?: string;
  description: ReactNode;
  forceCompleteDisabled?: boolean;
  forceCompletePending?: boolean;
  isOnboardingCompleted: boolean;
  onForceComplete?: () => void;
  progressPercent: number;
  onStartCall: () => void;
  title: ReactNode;
};

export default function CareerCallCard({
  callDisabled,
  callStartPending,
  ctaLabel,
  className,
  description,
  forceCompleteDisabled = false,
  forceCompletePending = false,
  isOnboardingCompleted,
  onForceComplete,
  progressPercent,
  onStartCall,
  title,
}: CareerCallCardProps) {
  const t = useCareerT();
  const resolvedCtaLabel =
    ctaLabel ?? t("career.call.career_call_card.0ocs6vv", "통화 시작");
  const pendingLabel = t("career.call.career_call_card.1vn8y3k", "연결 중...");
  const progressTitleId = useId();
  const resolvedProgressPercent = Math.max(
    0,
    Math.min(100, Math.round(progressPercent))
  );

  return (
    <div
      className={cn(
        "mt-6 rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-4 py-5 shadow-sm md:px-6",
        className
      )}
    >
      {isOnboardingCompleted ? (
        <div className="flex md:flex-row flex-col items-center justify-between gap-2">
          <div className="hidden h-14 w-14 min-w-14 bg-neutral-200 rounded-lg items-center justify-center md:flex">
            {/* <Face status="idle" size={60} aria-label="Harper" /> */}
            <PhoneCall
              className="h-6 w-6 text-neutral-muted"
              strokeWidth={1.6}
            />
          </div>
          <div className="flex w-full flex-col items-start justify-center gap-2 md:gap-1 px-2">
            <Text
              as="div"
              type="title"
              className="w-full text-center md:text-left"
            >
              {title}
            </Text>
            {typeof description === "string" ? (
              <Text
                as="div"
                type="desc"
                className="w-full text-center md:text-left"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            ) : (
              <Text
                as="div"
                type="desc"
                className="w-full text-center md:text-left"
              >
                {description}
              </Text>
            )}
          </div>
          <ActionButton
            onClick={onStartCall}
            disabled={callStartPending || callDisabled}
            actionVariant="primary"
            className="md:min-w-[110px] rounded-md font-normal min-w-[60%] mt-4 md:mt-0"
          >
            {callStartPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <></>
            )}
            <span className="min-w-0 truncate">
              {callStartPending ? pendingLabel : resolvedCtaLabel}
            </span>
          </ActionButton>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center justify-center gap-1 px-4 py-2">
          <div
            aria-labelledby={progressTitleId}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={resolvedProgressPercent}
            className="relative flex size-14 shrink-0 items-center justify-center"
            role="progressbar"
          >
            <svg
              aria-hidden="true"
              className="size-14 -rotate-90"
              viewBox="0 0 56 56"
            >
              <circle
                className="stroke-neutral-300"
                cx="28"
                cy="28"
                fill="none"
                pathLength="100"
                r="24"
                strokeWidth="4"
              />
              <circle
                className="stroke-primary transition-[stroke-dashoffset] duration-500"
                cx="28"
                cy="28"
                fill="none"
                pathLength="100"
                r="24"
                strokeDasharray="100"
                strokeDashoffset={100 - resolvedProgressPercent}
                strokeLinecap="round"
                strokeWidth="4"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-neutral-primary">
              {resolvedProgressPercent}%
            </span>
          </div>
          <Text
            as="h3"
            id={progressTitleId}
            type="head2"
            className="mt-4 text-center"
          >
            {title}
          </Text>
          <Text as="div" type="desc" className="mt-2 text-center">
            <div>{description}</div>
          </Text>
          <div className="mt-6 flex w-full max-w-[340px] items-center justify-center gap-2">
            <ActionButton
              onClick={onStartCall}
              disabled={
                callStartPending || callDisabled || forceCompletePending
              }
              actionVariant="primary"
              className={cn(onForceComplete ? "min-w-0 flex-1" : "min-w-[60%]")}
            >
              {callStartPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Phone className="h-4 w-4 shrink-0" strokeWidth={1.6} />
              )}
              <span className="min-w-0 truncate">
                {callStartPending ? pendingLabel : resolvedCtaLabel}
              </span>
            </ActionButton>
            {onForceComplete ? (
              <ActionButton
                actionVariant="secondary"
                className="min-w-0 flex-1 text-critical hover:text-critical"
                disabled={forceCompleteDisabled || callStartPending}
                onClick={onForceComplete}
              >
                {forceCompletePending ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Square
                    fill="currentColor"
                    className="h-4 w-4 shrink-0"
                    strokeWidth={1.6}
                  />
                )}
                <span className="min-w-0 truncate">
                  {t(
                    "career.chat.career_call_screen.force_complete_label",
                    "지금 마무리하기"
                  )}
                </span>
              </ActionButton>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
