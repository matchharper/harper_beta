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
          ? "border-positive/30 bg-positive-faded text-positive"
          : isNext && isPaused
            ? "border-info/30 bg-info-faded text-info"
            : isNext && isDue
              ? "border-info/30 bg-info-faded text-info"
              : isNext
                ? "border-neutral-1000-a10 bg-bg-floating text-neutral-muted"
                : "border-neutral-1000-a05 bg-transparent text-neutral-disabled";

        return (
          <React.Fragment key={stepNumber}>
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-md border text-xs font-medium ${tone}`}
            >
              {stepNumber}
            </div>
            {stepNumber < ATS_SEQUENCE_STEP_COUNT && (
              <div className="h-px w-3 bg-bg-floating" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
