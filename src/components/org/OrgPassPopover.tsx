import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";

export function OrgPassPopover({
  open,
  onOpenChange,
  onSubmit,
  pending,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<void>;
  pending: boolean;
  disabled?: boolean;
}) {
  const { c } = useOrgLocale();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const reasons = [
    c("경력·역량", "Experience / skills"),
    c("역할 적합도", "Role fit"),
    c("근무 조건", "Working preferences"),
    c("채용 시점", "Timing"),
  ];
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
          if (!next) {
            setReason("");
            setError("");
          }
        }
      }}
    >
      <Popover.Trigger asChild>
        <MuteButton disabled={disabled || pending} size="md">
          {c("Pass", "Pass")}
          <kbd className="ml-2 text-xs text-neutral-soft">P</kbd>
        </MuteButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-[100] w-72 rounded-lg border border-neutral-1000-a10 bg-bg-floating p-3 shadow-lg"
          aria-label={c("Pass 이유", "Pass reason")}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!reason.trim() || pending) return;
              setError("");
              try {
                await onSubmit(reason.trim());
                setReason("");
                onOpenChange(false);
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : c(
                        "처리하지 못했습니다.",
                        "Could not complete this action."
                      )
                );
              }
            }}
          >
            <div className="mb-3 flex flex-wrap gap-1">
              {reasons.map((value) => (
                <MuteButton
                  key={value}
                  size="sm"
                  variant={reason === value ? "neutral" : "transparent"}
                  onClick={() => setReason(value)}
                  disabled={pending}
                >
                  {value}
                </MuteButton>
              ))}
            </div>
            <Textarea
              aria-label={c("이유", "Reason")}
              placeholder={c("직접 입력", "Write a reason")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
              rows={3}
              disabled={pending}
            />
            {error && (
              <p role="alert" className="mt-2 text-xs text-critical">
                {error}
              </p>
            )}
            <MuteButton
              type="submit"
              variant="dark"
              className="mt-3 w-full"
              disabled={pending || !reason.trim()}
            >
              {c("제출", "Submit")}
            </MuteButton>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
