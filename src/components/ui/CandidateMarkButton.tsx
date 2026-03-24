import React, { useEffect, useMemo, useState } from "react";
import { Check, Minus, Pause, Plus, X } from "lucide-react";
import {
  CANDIDATE_MARK_OPTIONS,
  CandidateMarkIconKey,
  CandidateMarkStatus,
  getCandidateMarkMeta,
} from "@/lib/candidateMark";
import { useSetCandidateMark } from "@/hooks/useCandidateMark";
import { showToast } from "../toast/toast";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "./action-dropdown";
import { Tooltips } from "./tooltip";

type CandidateMarkButtonProps = {
  userId?: string;
  candidId: string;
  initialStatus?: CandidateMarkStatus | null;
  compact?: boolean;
  align?: "start" | "center" | "end";
  onChange?: (status: CandidateMarkStatus | null) => void;
};

function MarkIcon({
  iconKey,
  className = "",
}: {
  iconKey: CandidateMarkIconKey;
  className?: string;
}) {
  if (iconKey === "excluded") {
    return <X className={className} strokeWidth={2} />;
  }
  if (iconKey === "not_fit") {
    return <Minus className={className} strokeWidth={2} />;
  }
  if (iconKey === "hold") {
    return <Pause className={className} strokeWidth={2} />;
  }
  return <Check className={className} strokeWidth={2} />;
}

export default function CandidateMarkButton({
  userId,
  candidId,
  initialStatus = null,
  compact = false,
  align = "end",
  onChange,
}: CandidateMarkButtonProps) {
  const [status, setStatus] = useState<CandidateMarkStatus | null>(
    initialStatus ?? null
  );
  const { mutateAsync: setCandidateMark, isPending } = useSetCandidateMark();

  useEffect(() => {
    setStatus(initialStatus ?? null);
  }, [initialStatus]);

  const meta = useMemo(() => getCandidateMarkMeta(status), [status]);
  const tooltipText = meta ? `마크: ${meta.label}` : "마크 남기기";

  const handleClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSelect = async (nextStatus: CandidateMarkStatus | null) => {
    if (!userId || isPending) return;

    try {
      await setCandidateMark({ userId, candidId, status: nextStatus });
      setStatus(nextStatus);
      onChange?.(nextStatus);
    } catch (error) {
      console.error("candidate mark save error:", error);
      showToast({
        message: "마크 저장에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const trigger = (
    <button
      type="button"
      onMouseDown={handleClickCapture}
      onClick={handleClickCapture}
      disabled={!userId || isPending}
      className={[
        "inline-flex items-center justify-center rounded-lg border transition-colors duration-200 disabled:opacity-60",
        compact ? "h-8 w-8" : "h-8 w-8",
        meta
          ? `${meta.borderClassName} ${meta.bgClassName} ${meta.textClassName} hover:brightness-110`
          : "border-white/10 bg-black/20 text-white/75 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {meta ? (
        <MarkIcon iconKey={meta.iconKey} className="h-4 w-4" />
      ) : (
        <Plus className="h-4 w-4" strokeWidth={2} />
      )}
    </button>
  );

  return (
    <Tooltips text={tooltipText} side="bottom">
      <span onMouseDown={handleClickCapture} onClick={handleClickCapture}>
        <ActionDropdown
          align={align}
          sideOffset={8}
          contentClassName="min-w-[180px]"
          trigger={trigger}
        >
          {CANDIDATE_MARK_OPTIONS.map((option) => {
            const isSelected = option.value === status;
            return (
              <ActionDropdownItem
                key={option.value}
                disabled={isPending}
                onSelect={() => {
                  void handleSelect(option.value);
                }}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "inline-flex h-6 w-6 items-center justify-center rounded-md border",
                      option.borderClassName,
                      option.bgClassName,
                      option.textClassName,
                    ].join(" ")}
                  >
                    <MarkIcon iconKey={option.iconKey} className="h-3.5 w-3.5" />
                  </span>
                  <span>{option.label}</span>
                </div>
                {isSelected ? (
                  <Check className="h-4 w-4 text-accenta1" strokeWidth={1.8} />
                ) : null}
              </ActionDropdownItem>
            );
          })}

          {status ? (
            <>
              <ActionDropdownSeparator />
              <ActionDropdownItem
                disabled={isPending}
                onSelect={() => {
                  void handleSelect(null);
                }}
                className="text-white/70"
              >
                마크 해제
              </ActionDropdownItem>
            </>
          ) : null}
        </ActionDropdown>
      </span>
    </Tooltips>
  );
}
