import {
  ATS_SEQUENCE_STEP_COUNT,
  AtsCandidateSummary,
  AtsSequenceStepSchedule,
} from "@/lib/ats/shared";
import { FilterKey } from "@/pages/my/ats";

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTimeInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function describeSchedule(
  schedule: AtsSequenceStepSchedule,
  stepNumber: number
) {
  if (schedule.mode === "date") {
    return `${schedule.date ?? "-"} · ${schedule.sendTime}`;
  }
  if (stepNumber === 1) {
    return `Start +${schedule.delayDays}d · ${schedule.sendTime}`;
  }
  return `Prev step +${schedule.delayDays}d · ${schedule.sendTime}`;
}

export function isDueToday(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
}

export function resolveTargetEmail(candidate: AtsCandidateSummary) {
  if (candidate.outreach?.targetEmail) return candidate.outreach.targetEmail;
  return candidate.existingEmailSources[0]?.email ?? null;
}

export function matchesFilter(
  candidate: AtsCandidateSummary,
  filter: FilterKey
) {
  const hasEmail = Boolean(resolveTargetEmail(candidate));
  const outreach = candidate.outreach;

  if (filter === "all") return true;
  if (filter === "needs_email") return !hasEmail;
  if (filter === "paused") return outreach?.sequenceStatus === "paused";
  if (filter === "completed") return outreach?.sequenceStatus === "completed";
  if (filter === "active") {
    return Boolean(
      outreach &&
      outreach.sequenceStatus === "active" &&
      outreach.activeStep > 0 &&
      outreach.activeStep < ATS_SEQUENCE_STEP_COUNT
    );
  }
  if (filter === "ready") {
    return hasEmail && (outreach?.sequenceStatus ?? "draft") !== "completed";
  }

  return true;
}

export function getPreviewCandidate(
  candidates: AtsCandidateSummary[],
  selectedIds: string[],
  activeCandidate: AtsCandidateSummary | null
) {
  if (selectedIds.length === 0) {
    return activeCandidate;
  }
  if (activeCandidate && selectedIds.includes(activeCandidate.id)) {
    return activeCandidate;
  }
  return (
    candidates.find((candidate) => selectedIds.includes(candidate.id)) ?? null
  );
}

export function copyVariableToClipboard(label: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(label);
  }
  return Promise.reject(new Error("Clipboard unavailable"));
}
