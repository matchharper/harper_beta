import { BadgeIcon, Loader2, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type CareerCallCardProps = {
  callDisabled: boolean;
  callStartPending: boolean;
  ctaLabel?: string;
  className?: string;
  description: ReactNode;
  isOnboardingCompleted: boolean;
  onStartCall: () => void;
  title: ReactNode;
};

export default function CareerCallCard({
  callDisabled,
  callStartPending,
  ctaLabel = "통화 시작",
  className,
  description,
  isOnboardingCompleted,
  onStartCall,
  title,
}: CareerCallCardProps) {
  return (
    <div
      className={cn(
        "mt-6 rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-4 py-5 shadow-sm md:px-6",
        className
      )}
    >
      {isOnboardingCompleted ? (
        <div className="flex md:flex-row flex-col items-center justify-between gap-2">
          <div className="hidden h-12 w-12 min-w-12 items-center justify-center rounded-2xl bg-bg-weak md:flex">
            <Phone className="h-6 w-6 text-neutral-muted" strokeWidth={1.6} />
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
            className="md:min-w-[130px] min-w-[60%] mt-4 md:mt-0"
          >
            {callStartPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Phone className="h-4 w-4 shrink-0" strokeWidth={1.6} />
            )}
            <span className="min-w-0 truncate">
              {callStartPending ? "연결 중..." : ctaLabel}
            </span>
          </ActionButton>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center justify-center gap-1 px-4 py-2">
          <div className="flex h-12 w-12 min-w-12 items-center justify-center rounded-2xl bg-bg-weak">
            <BadgeIcon
              className="h-6 w-6 text-neutral-muted"
              strokeWidth={1.6}
            />
          </div>
          <Text as="h3" type="head2" className="mt-4 text-center">
            {title}
          </Text>
          <Text as="div" type="desc" className="mt-2 text-center">
            <div>{description}</div>
          </Text>
          <ActionButton
            onClick={onStartCall}
            disabled={callStartPending || callDisabled}
            actionVariant="primary"
            className="mt-6 md:min-w-[130px] min-w-[60%]"
          >
            {callStartPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Phone className="h-4 w-4 shrink-0" strokeWidth={1.6} />
            )}
            <span className="min-w-0 truncate">
              {callStartPending ? "연결 중..." : ctaLabel}
            </span>
          </ActionButton>
        </div>
      )}
    </div>
  );
}
