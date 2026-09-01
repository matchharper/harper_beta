import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CareerHistoryOpportunity } from "../types";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";

const COLLAPSED_HEIGHT_PX = 160;

export default function OpportunityRecommendationPreview({
  className,
  item,
}: {
  className?: string;
  item: CareerHistoryOpportunity;
}) {
  const t = useCareerT();
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const recommendationSummary = item.recommendationSummary?.trim() ?? "";
  const recommendationReasons = useMemo(
    () => item.recommendationReasons.slice(0, 2),
    [item.recommendationReasons]
  );
  const recommendationConcerns = useMemo(
    () => (item.recommendationConcerns ?? []).slice(0, 1),
    [item.recommendationConcerns]
  );
  const hasContent = Boolean(
    recommendationSummary ||
      recommendationReasons.length > 0 ||
      recommendationConcerns.length > 0
  );

  useEffect(() => {
    const content = contentRef.current;
    if (!content || expanded) return;

    const measureOverflow = () => {
      setTruncated(content.scrollHeight > COLLAPSED_HEIGHT_PX + 1);
    };
    measureOverflow();
    window.addEventListener("resize", measureOverflow);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureOverflow);
    resizeObserver?.observe(content);

    return () => {
      window.removeEventListener("resize", measureOverflow);
      resizeObserver?.disconnect();
    };
  }, [
    expanded,
    recommendationConcerns,
    recommendationReasons,
    recommendationSummary,
  ]);

  if (!hasContent) return null;

  return (
    <div className={cn("mt-4", className)}>
      <div className="relative">
        <div
          className={cn(
            "space-y-3 overflow-hidden text-sm text-neutral-primary",
            expanded ? "max-h-none" : "max-h-[160px]"
          )}
          id={contentId}
          ref={contentRef}
        >
          {recommendationSummary ? <div>{recommendationSummary}</div> : null}
          {recommendationReasons.map((reason, index) => (
            <div
              key={`${item.id}-reason-${index}`}
              className="flex items-start gap-2 text-sm"
            >
              <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-black/40" />
              <div
                className="min-w-0"
                dangerouslySetInnerHTML={{ __html: reason }}
              />
            </div>
          ))}
          {recommendationConcerns.map((concern, index) => (
            <div
              key={`${item.id}-concern-${index}`}
              className="flex items-start gap-2 text-sm"
            >
              <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-black" />
              <div className="text-sm leading-6 text-neutral-muted">
                {t(
                  "career.history.opportunity_list_card.0l12x89",
                  "주의 요소 :"
                )}{" "}
                {concern}
              </div>
            </div>
          ))}
        </div>

        {!expanded && truncated ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-18 items-end bg-gradient-to-b from-transparent via-bg-floating/90 to-bg-floating group-hover:via-bg-weak/90 group-hover:to-bg-weak">
            <MuteButton
              aria-controls={contentId}
              aria-expanded={false}
              className="pointer-events-auto w-full text-center"
              onClick={() => setExpanded(true)}
              size="sm"
              type="button"
              variant="transparent"
            >
              <ChevronDown className="size-3.5" />
              {t(
                "career.history.opportunity_recommendation_preview.show_more",
                "더보기"
              )}
            </MuteButton>
          </div>
        ) : null}
      </div>

      {expanded && truncated ? (
        <div className="mt-1 w-full text-center">
          <MuteButton
            aria-controls={contentId}
            aria-expanded
            className="w-full text-center"
            onClick={() => setExpanded(false)}
            size="sm"
            type="button"
            variant="transparent"
          >
            <ChevronUp className="size-3.5" />
            {t(
              "career.history.opportunity_recommendation_preview.collapse",
              "접기"
            )}
          </MuteButton>
        </div>
      ) : null}
    </div>
  );
}
