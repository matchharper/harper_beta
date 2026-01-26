import React, { useMemo, useState } from "react";
import { Check, Dot, X } from "lucide-react";
import { SummaryScore } from "@/types/type";

export type SynthItem = { score: string; reason: string };

function scoreIcon(score: string) {
  if (score === SummaryScore.SATISFIED)
    return <Check className="w-4 h-4 text-accenta1" strokeWidth={2.2} />;
  if (score === SummaryScore.AMBIGUOUS)
    return <Dot className="w-5 h-5 text-hgray700" strokeWidth={2.2} />;
  if (score === SummaryScore.UNSATISFIED)
    return <X className="w-4 h-4 text-red-600" strokeWidth={2.2} />;
  return <Dot className="w-5 h-5 text-hgray800" strokeWidth={2.2} />;
}

const SummaryCell = ({
  criteria,
  item,
}: {
  criteria: string;
  item?: SynthItem;
}) => {
  const [open, setOpen] = useState(false);

  const score = item?.score ?? "";
  const reasonHtml = useMemo(() => {
    const raw = item?.reason ?? "";

    return raw.replace(/strong>/g, 'span class="text-white font-medium">');
  }, [item?.reason]);

  return (
    <div
      className="relative overflow-visible flex items-center justify-center h-full px-8 py-4 w-full border-r border-white/5"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="w-full h-[36px] flex items-center justify-center rounded-lg transition-colors px-2">
        {scoreIcon(score)}
      </div>

      <HoverPopover
        open={open}
        criteria={criteria}
        score={score}
        reasonHtml={reasonHtml}
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
  reasonHtml,
}: {
  open: boolean;
  title?: string;
  criteria: string;
  score: string;
  reasonHtml: string;
}) => {
  if (!open) return null;
  return (
    <div
      className="
          absolute z-50 top-[calc(100%+8px)] left-0
          w-[420px]
          rounded-xl border border-white/5
          bg-hgray100/50 backdrop-blur-md
          shadow-[0_16px_60px_rgba(0,0,0,0.45)]
          p-4
        "
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] text-white font-normal truncate">
            {criteria || "-"}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <div>{scoreIcon(score)}</div>
        </div>
      </div>

      <div className="mt-3 h-px bg-white/10" />

      <div className="mt-3">
        <div
          className="text-[14px] leading-relaxed text-hgray800"
          dangerouslySetInnerHTML={{
            __html:
              reasonHtml || "<span class='text-hgray700'>No details</span>",
          }}
        />
      </div>

      {title && (
        <div className="mt-3 text-[12px] text-hgray700 truncate">{title}</div>
      )}
    </div>
  );
};
