import {
  formatMeetingAvailabilitySummary,
  type MeetingAvailabilityDocument,
} from "@/lib/meetings/availability";
import type { useOrgT } from "./OrgLocaleProvider";

export function formatOrgMeetingAvailabilitySummary(
  availability: MeetingAvailabilityDocument,
  t: ReturnType<typeof useOrgT>
) {
  return formatMeetingAvailabilitySummary(availability, {
    none: t("meetingSummary.none", "반복 시간 없음"),
    daily: (intervals) => t("meetingSummary.daily", "매일 {intervals}", { intervals }),
    weekdays: (intervals) => t("meetingSummary.weekdays", "평일 {intervals}", { intervals }),
    weekly: (days) => t("meetingSummary.weekly", "주 {days}일 설정", { days }),
    exceptions: (days) => t("meetingSummary.exceptions", "예외 {days}일", { days }),
  });
}
