import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  CirclePause,
  CircleX,
  Clock3,
  Linkedin,
  Mail,
  Search,
  Send,
  Tag,
  X,
} from "lucide-react";
import { useSetAtsSequenceMark } from "@/hooks/useAtsWorkspace";
import {
  ATS_SEQUENCE_MARK_OPTIONS,
  type AtsSequenceMarkIconKey,
  getAtsSequenceMarkMeta,
} from "@/lib/ats/sequenceMark";
import type { AtsSequenceMarkStatus } from "@/lib/ats/shared";
import { showToast } from "../toast/toast";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "./action-dropdown";
import { Tooltips } from "./tooltip";

type AtsSequenceMarkButtonProps = {
  align?: "start" | "center" | "end";
  candidId: string;
  compact?: boolean;
  initialStatus?: AtsSequenceMarkStatus | null;
  onChange?: (status: AtsSequenceMarkStatus | null) => void;
};

function SequenceMarkIcon({
  className = "",
  iconKey,
}: {
  className?: string;
  iconKey: AtsSequenceMarkIconKey;
}) {
  if (iconKey === "need_email") {
    return <Search className={className} strokeWidth={2} />;
  }
  if (iconKey === "ready") {
    return <Mail className={className} strokeWidth={2} />;
  }
  if (iconKey === "find_fail") {
    return <CircleX className={className} strokeWidth={2} />;
  }
  if (iconKey === "in_sequence") {
    return <Send className={className} strokeWidth={2} />;
  }
  if (iconKey === "linkedin_contacted") {
    return <Linkedin className={className} strokeWidth={2} />;
  }
  if (iconKey === "waiting_reply") {
    return <Clock3 className={className} strokeWidth={2} />;
  }
  if (iconKey === "paused") {
    return <CirclePause className={className} strokeWidth={2} />;
  }
  if (iconKey === "closed") {
    return <X className={className} strokeWidth={2} />;
  }
  return <Check className={className} strokeWidth={2} />;
}

export default function AtsSequenceMarkButton({
  align = "end",
  candidId,
  compact = false,
  initialStatus = null,
  onChange,
}: AtsSequenceMarkButtonProps) {
  const [status, setStatus] = useState<AtsSequenceMarkStatus | null>(
    initialStatus ?? null
  );
  const { mutateAsync: setSequenceMark, isPending } = useSetAtsSequenceMark();

  useEffect(() => {
    setStatus(initialStatus ?? null);
  }, [initialStatus]);

  const meta = useMemo(() => getAtsSequenceMarkMeta(status), [status]);
  const tooltipText = meta
    ? `시퀀스 마크: ${meta.label}`
    : "시퀀스 마크 남기기";

  const handleClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSelect = async (nextStatus: AtsSequenceMarkStatus | null) => {
    if (isPending) return;

    try {
      await setSequenceMark({ candidId, status: nextStatus });
      setStatus(nextStatus);
      onChange?.(nextStatus);
    } catch (error) {
      console.error("ats sequence mark save error:", error);
      showToast({
        message: "시퀀스 마크 저장에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const trigger = (
    <button
      type="button"
      onMouseDown={handleClickCapture}
      onClick={handleClickCapture}
      disabled={isPending}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-md transition disabled:opacity-60",
        compact ? "h-8 px-2 text-sm" : "h-8 px-2 text-sm",
        meta
          ? `${meta.bgClassName} hover:brightness-110 text-white`
          : "border border-beige900/8 bg-beige500/55 text-beige900/60 hover:bg-beige50/80 hover:text-beige900",
      ].join(" ")}
    >
      {meta ? (
        <SequenceMarkIcon iconKey={meta.iconKey} className="h-3.5 w-3.5" />
      ) : (
        <Tag className="h-4 w-4" strokeWidth={1.7} />
      )}
      {meta?.shortLabel}
    </button>
  );

  return (
    <Tooltips text={tooltipText} side="bottom">
      <span onMouseDown={handleClickCapture} onClick={handleClickCapture}>
        <ActionDropdown
          align={align}
          sideOffset={8}
          contentClassName="min-w-[200px]"
          trigger={trigger}
        >
          {ATS_SEQUENCE_MARK_OPTIONS.map((option) => {
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
                      "inline-flex h-6 w-6 items-center justify-center rounded-md",
                      option.bgClassName,
                    ].join(" ")}
                  >
                    <SequenceMarkIcon
                      iconKey={option.iconKey}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                  <div className="min-w-0">
                    <div>{option.label}</div>
                    <div className="text-xs text-beige900/45">
                      {option.description}
                    </div>
                  </div>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-accentBronze" strokeWidth={1.8} />
                )}
              </ActionDropdownItem>
            );
          })}

          {status && (
            <>
              <ActionDropdownSeparator />
              <ActionDropdownItem
                disabled={isPending}
                onSelect={() => {
                  void handleSelect(null);
                }}
                className="text-beige900/55"
              >
                마크 해제
              </ActionDropdownItem>
            </>
          )}
        </ActionDropdown>
      </span>
    </Tooltips>
  );
}
