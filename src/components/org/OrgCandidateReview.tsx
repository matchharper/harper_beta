"use client";

import { useEffect, useRef } from "react";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgTalentDetailResponse } from "@/lib/org/server";
import {
  OrgCandidateReviewHeader,
  type OrgCandidateReviewHeaderProps,
} from "./OrgCandidateReviewHeader";
import {
  OrgCandidateReviewContent,
  type OrgCandidateReviewContentProps,
} from "./OrgCandidateReviewContent";
import { OrgTalentNotes } from "./OrgTalentNotes";

export type OrgCandidateReviewProps = Omit<
  OrgCandidateReviewHeaderProps,
  "detail"
> & {
  detail?: OrgTalentDetailResponse;
  error: Error | null;
  onRetry: () => void;
  onResume: OrgCandidateReviewContentProps["onResumeClick"];
};

/** Shared inline review surface for Home and the role inbox. */
export function OrgCandidateReview({
  detail,
  error,
  onRetry,
  onResume,
  ...headerProps
}: OrgCandidateReviewProps) {
  const { c } = useOrgLocale();
  const reviewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const review = reviewRef.current;
    const scroller = review?.closest<HTMLElement>("[data-org-review-scroll]");
    if (!review || !scroller) return;
    const reviewTop =
      review.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    if (scroller.scrollTop > reviewTop)
      scroller.scrollTo({ top: Math.max(0, reviewTop) });
  }, [detail?.recommendation.recommendationId]);

  return (
    <section
      ref={reviewRef}
      aria-label={c("후보자 검토", "Candidate review")}
      className="@container/review min-w-0 rounded-lg"
    >
      <OrgCandidateReviewHeader
        key={detail?.recommendation.recommendationId}
        {...headerProps}
        detail={detail}
      />
      <OrgCandidateReviewContent
        className={headerProps.navigationTitle ? "px-0 pt-3 md:px-2" : "px-0 pt-6 md:mt-4 md:px-4 md:pt-8"}
        detail={detail}
        error={error}
        onRetry={onRetry}
        onResumeClick={onResume}
        footer={
          detail && (
            <OrgTalentNotes
              key={`${detail.role.roleId}:${detail.talent.userId}`}
              detail={detail}
              canManage={headerProps.canManage}
            />
          )
        }
      />
    </section>
  );
}
