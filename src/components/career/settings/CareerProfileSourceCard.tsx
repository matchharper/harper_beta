import type { ReactNode } from "react";
import { CardButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAREER_PROFILE_SOURCE_CARD_CLASS } from "./careerProfileSourceCardStyles";
import { Tooltips } from "@/components/ui/tooltip";

type CareerProfileSourceCardProps = {
  action?: ReactNode;
  ariaLabel?: string;
  badge?: ReactNode;
  className?: string;
  icon: ReactNode;
  meta?: ReactNode;
  muted?: boolean;
  onActivate?: () => void;
  title: ReactNode;
};

const CareerProfileSourceCard = ({
  action,
  ariaLabel,
  badge,
  className,
  icon,
  meta,
  muted = false,
  onActivate,
  title,
}: CareerProfileSourceCardProps) => {
  const content = (
    <>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-bg-weak",
          muted && "grayscale opacity-45"
        )}
      >
        {icon}
      </span>
      <span className="mt-auto block min-w-0">
        <span className="line-clamp-2 break-words text-[13px] font-medium leading-[17px]">
          {title}
        </span>
        {meta ? (
          <span className="mt-1 line-clamp-1 text-[11px] font-normal leading-4 text-neutral-muted">
            {meta}
          </span>
        ) : null}
        {badge ? <span className="mt-1.5 block">{badge}</span> : null}
      </span>
    </>
  );

  return (
    <article className={cn(CAREER_PROFILE_SOURCE_CARD_CLASS, className)}>
      {onActivate ? (
        <CardButton
          aria-label={ariaLabel}
          onClick={onActivate}
          className="h-full w-full flex-col items-start rounded-none border-0 bg-transparent p-3 shadow-none hover:border-0 hover:bg-transparent focus-visible:ring-inset"
        >
          {content}
        </CardButton>
      ) : (
        <div className="flex h-full w-full flex-col items-start p-3 text-left">
          {content}
        </div>
      )}
      {action ? (
        <div className="absolute right-1.5 top-1.5">{action}</div>
      ) : null}
    </article>
  );
};

export default CareerProfileSourceCard;
