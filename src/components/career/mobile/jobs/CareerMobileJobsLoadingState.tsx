"use client";

import { motion } from "motion/react";
import { useCareerT } from "@/i18n/useCareerT";
import { Skeleton } from "@/components/ui/skeleton";

export function CareerMobileJobsLoadingState() {
  const t = useCareerT();

  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-busy="true"
      aria-label={t(
        "career.common.career_history_panel.0s3czqf",
        "저장된 정보를 불러오는 중입니다..."
      )}
      className="flex flex-1 flex-col gap-3 px-4 pb-28 pt-4"
    >
      <section className="rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-24 rounded-full" />
            <Skeleton className="h-6 w-10/12 rounded-full" />
            <Skeleton className="h-4 w-7/12 rounded-full" />
          </div>
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        </div>
        <div className="mt-5 space-y-2">
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-11/12 rounded-full" />
          <Skeleton className="h-4 w-8/12 rounded-full" />
        </div>
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </section>
      {[0, 1].map((item) => (
        <section
          key={item}
          className="rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-4"
        >
          <Skeleton className="h-5 w-8/12 rounded-full" />
          <Skeleton className="mt-3 h-4 w-full rounded-full" />
          <Skeleton className="mt-2 h-4 w-9/12 rounded-full" />
        </section>
      ))}
    </motion.div>
  );
}
