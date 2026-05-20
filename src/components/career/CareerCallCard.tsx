import { Badge, Loader2, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { CareerActionButton } from "@/components/career/ui/CareerActionButton";
import { Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

type CareerCallCardProps = {
  callDisabled: boolean;
  callStartPending: boolean;
  className?: string;
  description: ReactNode;
  isOnboardingCompleted: boolean;
  onStartCall: () => void;
  title: ReactNode;
};

export default function CareerCallCard({
  callDisabled,
  callStartPending,
  className,
  description,
  isOnboardingCompleted,
  onStartCall,
  title,
}: CareerCallCardProps) {
  return (
    <div
      className={cn(
        "mt-6 rounded-3xl border border-beige900/0 md:border-beige900/10 bg-beige100 px-4 md:px-6 py-5",
        className
      )}
    >
      {isOnboardingCompleted ? (
        <div className="flex md:flex-row flex-col items-center justify-between gap-2">
          <div className="hidden md:flex h-12 w-12 min-w-12 items-center justify-center rounded-2xl bg-beige200">
            <Phone className="h-6 w-6 text-beige700" strokeWidth={1.6} />
          </div>
          <div className="flex w-full flex-col items-start justify-center gap-2 md:gap-1 px-2">
            <Text
              as="div"
              type="title"
              className="w-full text-center md:text-left"
            >
              {title}
            </Text>
            <Text
              as="div"
              type="desc"
              className="w-full text-center md:text-left"
            >
              {description}
            </Text>
          </div>
          <CareerActionButton
            onClick={onStartCall}
            disabled={callStartPending || callDisabled}
            actionVariant="primary"
            className="md:min-w-[130px] min-w-[60%] mt-4 md:mt-0"
          >
            {callStartPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" strokeWidth={1.6} />
            )}
            {callStartPending ? "연결 중..." : "통화 시작"}
          </CareerActionButton>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center justify-center gap-1 px-4 py-2">
          <div className="flex h-12 w-12 min-w-12 items-center justify-center rounded-2xl bg-beige200">
            <Badge className="h-6 w-6 text-beige700" strokeWidth={1.6} />
          </div>
          <Text as="h3" type="head2" className="mt-4 text-center">
            {title}
          </Text>
          <Text as="div" type="desc" className="mt-2 text-center">
            <div>{description}</div>
          </Text>
          <CareerActionButton
            onClick={onStartCall}
            disabled={callStartPending || callDisabled}
            actionVariant="primary"
            className="mt-6 md:min-w-[130px] min-w-[60%]"
          >
            {callStartPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" strokeWidth={1.6} />
            )}
            {callStartPending ? "연결 중..." : "통화 시작"}
          </CareerActionButton>
        </div>
      )}
    </div>
  );
}
