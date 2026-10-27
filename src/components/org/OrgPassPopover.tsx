import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  DEFAULT_ORG_STOP_REASONS,
  extractCustomOrgStopReasons,
  useOrgStopReasonStore,
} from "@/store/useOrgStopReasonStore";

export function OrgPassPopover({
  open,
  onOpenChange,
  onSubmit,
  pending,
  disabled,
  shortcut = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<void>;
  pending: boolean;
  disabled?: boolean;
  shortcut?: boolean;
}) {
  const { c } = useOrgLocale();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const savedReasons = useOrgStopReasonStore((state) => state.savedReasons);
  const rememberReasons = useOrgStopReasonStore(
    (state) => state.rememberReasons
  );
  const reasons = Array.from(
    new Set([
      c("경력·역량", "Experience / skills"),
      c("역할 적합도", "Role fit"),
      c("근무 조건", "Working preferences"),
      c("채용 시점", "Timing"),
      ...DEFAULT_ORG_STOP_REASONS,
      ...savedReasons,
    ])
  );
  const selectedReasons = new Set(
    reason.split(/\r?\n/).map((line) => line.trim())
  );
  const toggleReason = (value: string) => {
    setReason((current) => {
      const lines = current.split(/\r?\n/);
      if (lines.some((line) => line.trim() === value)) {
        return lines.filter((line) => line.trim() !== value).join("\n");
      }
      return `${current}${current && !current.endsWith("\n") ? "\n" : ""}${value}\n`;
    });
  };
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
        <MuteButton
          disabled={disabled || pending}
          size="md"
          variant="neutral"
          aria-keyshortcuts={shortcut ? "p" : undefined}
          className="px-3 py-1.5 border-none text-[15px]"
        >
          {c("Pass", "Pass")}
          {shortcut && (
            <kbd
              aria-hidden
              className="ml-2 hidden text-xs text-neutral-soft @min-[500px]/review:inline"
            >
              P
            </kbd>
          )}
        </MuteButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-[100] max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto rounded-lg border border-neutral-1000-a10 bg-bg-floating p-3 shadow-lg"
          aria-label={c("Pass 이유", "Reason for passing")}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!reason.trim() || pending) return;
              setError("");
              try {
                await onSubmit(reason.trim());
                rememberReasons(
                  extractCustomOrgStopReasons(reason.trim(), reasons)
                );
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
                  variant={selectedReasons.has(value) ? "dark" : "neutral"}
                  onClick={() => toggleReason(value)}
                  aria-pressed={selectedReasons.has(value)}
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
              className="mt-0 w-full"
              disabled={pending || !reason.trim()}
            >
              {c("Pass", "Pass")}
            </MuteButton>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
