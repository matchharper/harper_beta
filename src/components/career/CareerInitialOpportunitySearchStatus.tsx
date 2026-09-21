import Image from "next/image";
import React from "react";

import type { CareerOpportunityRun } from "@/components/career/types";
import { Tooltips } from "@/components/ui/tooltip";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";

export type ActiveInitialOpportunitySearchStatus = "queued" | "running";

type CareerInitialOpportunitySearchStatusProps = {
  className?: string;
  status: ActiveInitialOpportunitySearchStatus;
  variant: "composer" | "home";
};

const SEARCH_LIST_ROW_INDEXES = [0, 1, 2] as const;

export function resolveInitialOpportunitySearchStatus(
  run: CareerOpportunityRun | null
) {
  if (
    !run ||
    run.trigger !== "conversation_completed" ||
    (run.status !== "queued" && run.status !== "running")
  ) {
    return null;
  }
  return run.status;
}

export function useInitialOpportunitySearchStatus(
  run: CareerOpportunityRun | null
) {
  return resolveInitialOpportunitySearchStatus(run);
}

function ComposerSearchFace() {
  return (
    <span
      aria-hidden="true"
      className="relative flex size-6 shrink-0 items-center justify-center"
    >
      <Image alt="" height={14} src="/svgs/face.svg" width={14} />
    </span>
  );
}

function HomeSearchIllustration() {
  return (
    <div
      aria-hidden="true"
      className="relative h-16 w-18 shrink-0 overflow-hidden rounded-2xl bg-neutral-50"
    >
      <div className="absolute inset-y-4 left-8 right-3 flex flex-col justify-between">
        {SEARCH_LIST_ROW_INDEXES.map((index) => (
          <span
            className="career-opportunity-search-list-row block h-[5px] rounded-full bg-neutral-700/30"
            key={index}
          />
        ))}
      </div>
      <span className="career-opportunity-search-list-face absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-bg-floating/50">
        <Image alt="" height={21} src="/svgs/face.svg" width={21} />
      </span>
    </div>
  );
}

export default function CareerInitialOpportunitySearchStatus({
  className,
  status,
  variant,
}: CareerInitialOpportunitySearchStatusProps) {
  const t = useCareerT();
  const title = t(
    "career.common.career_initial_opportunity_search_status.searching_title",
    "기회를 찾고 있어요"
  );
  const composerDetail = t(
    "career.common.career_initial_opportunity_search_status.searching_tooltip",
    "Harper가 프로필과 대화 내용을 바탕으로 잘 맞는 기회를 백그라운드에서 찾고 있어요. 탐색 중에도 계속 대화할 수 있습니다."
  );
  const homeDetail = t(
    "career.common.career_initial_opportunity_search_status.searching_home_detail",
    "프로필과 방금 나눈 대화를 바탕으로 잘 맞는 기회를 살펴보고 있어요. 화면을 닫아도 탐색은 계속됩니다."
  );

  if (variant === "composer") {
    return (
      <section
        aria-live="polite"
        className={cn("mb-2 w-fit max-w-full", className)}
        data-search-status={status}
        role="status"
      >
        <Tooltips side="top" text={composerDetail}>
          <button
            aria-label={`${title}. ${composerDetail}`}
            className="inline-flex max-w-full items-center gap-1.5 border-0 bg-transparent p-0 text-left text-neutral-primary"
            type="button"
          >
            <ComposerSearchFace />
            <span className="career-thinking-shimmer-slow text-[13px] font-normal leading-5">
              {title}
            </span>
          </button>
        </Tooltips>
      </section>
    );
  }

  return (
    <section
      aria-live="polite"
      className={cn(
        "mt-6 w-full rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-4 py-5 text-neutral-primary shadow-sm md:px-6",
        className
      )}
      data-search-status={status}
      role="status"
    >
      <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
        <HomeSearchIllustration />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-6 md:text-base">
            {t(
              "career.common.career_initial_opportunity_search_status.searching_home_title",
              "Harper가 잘 맞는 기회를 찾고 있어요"
            )}
          </p>
          <p className="mt-1 text-[13px] leading-5 text-neutral-muted">
            {homeDetail}
          </p>
        </div>
      </div>
    </section>
  );
}
