import {
  formatMeetingAvailabilitySummary,
  type MeetingAvailabilityDocument,
} from "@/lib/meetings/availability";
import type { OrgCopy } from "./OrgLocaleProvider";

export function formatOrgMeetingAvailabilitySummary(
  availability: MeetingAvailabilityDocument,
  c: OrgCopy
) {
  return formatMeetingAvailabilitySummary(availability, {
    none: c("반복 시간 없음", "No recurring hours"),
    daily: (intervals) =>
      c("매일 {intervals}", "Daily {intervals}", { intervals }),
    weekdays: (intervals) =>
      c("평일 {intervals}", "Weekdays {intervals}", { intervals }),
    weekly: (days) =>
      c("주 {days}일 설정", "Set for {days} days per week", { days }),
    exceptions: (days) => c("예외 {days}일", "{days} date overrides", { days }),
  });
}
