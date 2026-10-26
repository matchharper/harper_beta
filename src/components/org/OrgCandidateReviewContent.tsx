"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  OrgTalentProfileContent,
  type OrgTalentProfileContentProps,
} from "./OrgTalentProfile";
import { OrgErrorState } from "./workspace/OrgErrorState";

export type OrgCandidateReviewContentProps = Pick<
  OrgTalentProfileContentProps,
  "onResumeClick" | "footer"
> & {
  detail?: OrgTalentProfileContentProps["detail"];
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
};

/** Information-only review body. Callers own data loading and optional notes. */
export function OrgCandidateReviewContent({
  detail,
  error,
  onRetry,
  onResumeClick,
  footer,
  className,
}: OrgCandidateReviewContentProps) {
  return (
    <div className={className}>
      {error && <OrgErrorState message={error.message} onRetry={onRetry} />}
      {detail ? (
        <div className="mx-auto max-w-[980px]">
          <OrgTalentProfileContent
            detail={detail}
            onResumeClick={onResumeClick}
            review
            footer={footer}
          />
        </div>
      ) : !error ? (
        <div aria-busy="true" className="space-y-8">
          <Skeleton className="h-16 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : null}
    </div>
  );
}
