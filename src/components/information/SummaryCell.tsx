import React, { useMemo, useState } from "react";
import { Check, Dot, X } from "lucide-react";
import { SummaryScore } from "@/types/type";

export type SynthItem = { score: string; reason: string };

function sanitizeReasonText(raw: string, isDark: boolean) {
  return (
    raw
      .replace(/<br\s*\/?>/gi, "\n")
      // .replace(/<\/?strong>/gi, "")
      // .replace(/<[^>]+>/g, "")
      .replace(
        /<strong>/gi,
        isDark
          ? "<span class='font-medium text-white'>"
          : "<span class='font-medium text-beige900'>"
      )
      .replace(/<\/strong>/gi, "</span>")
      .trim()
  );
}

function scoreIcon(score: string, isDark: boolean) {
  if (score === SummaryScore.SATISFIED)
    return (
      <Check
        className={`w-4 h-4 ${isDark ? "text-accenta1" : "text-accentBronze"}`}
        strokeWidth={2.2}
      />
    );
  if (score === SummaryScore.AMBIGUOUS)
    return (
      <Dot
        className={`w-5 h-5 ${isDark ? "text-hgray700" : "text-beige900/55"}`}
        strokeWidth={2.2}
      />
    );
  if (score === SummaryScore.UNSATISFIED)
    return <X className="w-4 h-4 text-red-600" strokeWidth={2.2} />;
  return (
    <Dot
      className={`w-5 h-5 ${isDark ? "text-hgray800" : "text-beige900/55"}`}
      strokeWidth={2.2}
    />
  );
}

const SummaryCell = ({
  criteria,
  item,
  theme = "cream",
}: {
  criteria: string;
  item?: SynthItem;
  theme?: "dark" | "cream";
}) => {
  const isDark = theme === "dark";
  const [open, setOpen] = useState(false);

  const score = item?.score ?? "";
  const reasonText = useMemo(() => {
    const raw = String(item?.reason ?? "");
    return sanitizeReasonText(raw, isDark);
  }, [item?.reason, isDark]);

  return (
    <div
      className="relative overflow-visible flex items-center justify-center px-2 h-[80%] w-full border-r border-white/5"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="w-full flex items-center justify-center rounded-lg transition-colors px-2">
        {scoreIcon(score, isDark)}
      </div>

      <HoverPopover
        open={open}
        criteria={criteria}
        score={score}
        reasonText={reasonText}
        isDark={isDark}
      />
    </div>
  );
};

export default React.memo(SummaryCell);

const HoverPopover = ({
  open,
  title,
  criteria,
  score,
  reasonText,
  isDark = false,
}: {
  open: boolean;
  title?: string;
  criteria: string;
  score: string;
  reasonText: string;
  isDark?: boolean;
}) => {
  if (!open) return null;
  return (
    <div
      className={`
          absolute z-50 top-[calc(100%+8px)] left-0
          w-[420px]
          rounded-xl p-4
          shadow-[0_16px_60px_rgba(0,0,0,0.45)]
          ${isDark
            ? "border border-white/5 bg-hgray100/50 backdrop-blur-md"
            : "border border-beige900/8 bg-beige50 backdrop-blur-md"
          }
        `}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[14px] font-normal truncate ${isDark ? "text-white" : "text-beige900"}`}>
            {criteria || "-"}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <div>{scoreIcon(score, isDark)}</div>
        </div>
      </div>

      <div className={`mt-3 h-px ${isDark ? "bg-white/10" : "bg-beige900/8"}`} />

      <div className="mt-3">
        <div
          className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words ${isDark ? "text-hgray800" : "text-beige900/80"}`}
          dangerouslySetInnerHTML={{ __html: reasonText || "No details" }}
        />
      </div>

      {title && (
        <div className={`mt-3 text-[12px] truncate ${isDark ? "text-hgray700" : "text-beige900/65"}`}>{title}</div>
      )}
    </div>
  );
};
