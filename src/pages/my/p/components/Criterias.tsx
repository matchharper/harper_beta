import { SummaryScore } from "@/types/type";
import { Check, X } from "lucide-react";
import { Dot } from "lucide-react";
import React from "react";
import { sanitizeProfileLine } from "./ProfileBio";
import { Tooltips } from "@/components/ui/tooltip";

type CriteriaSummaryItem = {
  criteria: string;
  score: string;
  reason: string;
};

function scoreIcon(score: string) {
  if (score === SummaryScore.SATISFIED)
    return <Check className="w-3.5 h-3.5 text-accenta1" strokeWidth={2.2} />;
  if (score === SummaryScore.UNSATISFIED)
    return <X className="w-3.5 h-3.5 text-red-500" strokeWidth={2.2} />;
  return <Dot className="w-4 h-4 text-hgray700" strokeWidth={2.2} />;
}

function scoreClassName(score: string) {
  if (score === SummaryScore.SATISFIED) return "text-accenta1";
  if (score === SummaryScore.UNSATISFIED) return "text-red-500";
  return "text-hgray700";
}

const Criterias = ({
  criteriaSummaries,
}: {
  criteriaSummaries: CriteriaSummaryItem[];
}) => {
  if (!criteriaSummaries || criteriaSummaries.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex flex-row flex-wrap items-center gap-2 mb-1">
        {criteriaSummaries.map((item, idx) => {
          const safeReason = sanitizeProfileLine(item.reason ?? "");
          const tooltipText = safeReason
            ? `${item.criteria}\n${item.score || "정보 없음"}\n${safeReason}`
            : `${item.criteria}\n${item.score || "정보 없음"}`;

          return (
            <Tooltips key={`${item.criteria}-${idx}`} text={tooltipText}>
              <div
                className={`inline-flex max-w-[260px] items-center gap-1.5 rounded-md pr-2 py-1 text-xs font-normal ${scoreClassName(
                  item.score
                )}`}
              >
                {scoreIcon(item.score)}
                <span className="truncate">{item.criteria}</span>
              </div>
            </Tooltips>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(Criterias);
