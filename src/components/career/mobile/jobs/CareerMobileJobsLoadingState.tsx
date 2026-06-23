"use client";

import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { useCareerT } from "@/i18n/useCareerT";

export function CareerMobileJobsLoadingState() {
  const t = useCareerT();

  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 items-center justify-center gap-2 px-6 py-20 text-[15px] text-neutral-muted"
    >
      <Loader2 className="h-4 w-4 animate-spin text-neutral-primary" />
      <span>
        {t(
          "career.common.career_history_panel.0s3czqf",
          "저장된 정보를 불러오는 중입니다..."
        )}
      </span>
    </motion.div>
  );
}
