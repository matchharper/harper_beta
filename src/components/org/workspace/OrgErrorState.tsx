import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OrgErrorState({
  className,
  message,
  onRetry,
}: {
  className?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-y border-critical/20 py-4 text-[13px] text-critical sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      role="alert"
    >
      <span>{message}</span>
      {onRetry ? (
        <MuteButton
          className="self-start sm:self-auto"
          onClick={onRetry}
          size="md"
          type="button"
        >
          다시 시도
        </MuteButton>
      ) : null}
    </div>
  );
}
