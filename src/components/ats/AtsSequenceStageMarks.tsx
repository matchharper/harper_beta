import React from "react";
import {
  ATS_SEQUENCE_STEP_COUNT,
  type AtsOutreachRecord,
} from "@/lib/ats/shared";
import { isDueToday } from "@/components/ats/utils";

export default function AtsSequenceStageMarks({
  outreach,
}: {
  outreach: AtsOutreachRecord | null;
}) {
  const completedSteps = Math.min(
    outreach?.activeStep ?? 0,
    ATS_SEQUENCE_STEP_COUNT
  );
  const nextStep =
    outreach &&
    outreach.sequenceStatus !== "completed" &&
    completedSteps < ATS_SEQUENCE_STEP_COUNT
      ? completedSteps + 1
      : null;
  const isPaused = outreach?.sequenceStatus === "paused";
  const isDue = Boolean(outreach?.nextDueAt && isDueToday(outreach.nextDueAt));

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: ATS_SEQUENCE_STEP_COUNT }, (_, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber <= completedSteps;
        const isNext = nextStep === stepNumber;
        const tone = isCompleted
          ? "border-emerald-400/20 bg-emerald-400/15 text-emerald-700"
          : isNext && isPaused
            ? "border-amber-400/20 bg-amber-400/10 text-amber-700"
            : isNext && isDue
              ? "border-sky-400/20 bg-sky-400/10 text-sky-700"
              : isNext
                ? "border-beige900/15 bg-beige500/55 text-beige900/65"
                : "border-beige900/8 bg-transparent text-beige900/25";

        return (
          <React.Fragment key={stepNumber}>
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-md border text-xs font-medium ${tone}`}
            >
              {stepNumber}
            </div>
            {stepNumber < ATS_SEQUENCE_STEP_COUNT && (
              <div className="h-px w-3 bg-beige900/8" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
