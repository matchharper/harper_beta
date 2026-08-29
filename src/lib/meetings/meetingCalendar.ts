export type MeetingCalendarDeliveryStatus =
  | "pending"
  | "creating"
  | "created"
  | "created_without_meet"
  | "failed";

export type MeetingCalendarDelivery = {
  calendarUrl: string | null;
  error: string | null;
  meetUrl: string | null;
  status: MeetingCalendarDeliveryStatus;
  updatedAt: string;
};

export type MeetingCalendarRetryResponse = {
  calendar: MeetingCalendarDelivery;
  ok: true;
};

function safeHttpsUrl(value: unknown) {
  const raw = clean(value, 2_048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * The candidate receives the Calendar invitation and sees its result on the
 * public scheduling page. This companion notice gives the company the same
 * actual delivery result in the originating chat or Slack thread.
 */
export function buildMeetingCalendarDeliveryNotice(args: {
  calendar: MeetingCalendarDelivery;
  companyMessage: string;
}) {
  const companyMessage = clean(args.companyMessage, 800);
  const meetUrl = safeHttpsUrl(args.calendar.meetUrl);
  const calendarUrl = safeHttpsUrl(args.calendar.calendarUrl);
  let deliveryMessage: string;

  if (args.calendar.status === "created" && meetUrl) {
    deliveryMessage = [
      "후보자와 회사 참석자에게 Calendar 초대를 보냈고 Google Meet 링크도 함께 전달했어요.",
      `Google Meet: ${meetUrl}`,
      ...(calendarUrl ? [`Calendar 일정: ${calendarUrl}`] : []),
    ].join("\n");
  } else if (args.calendar.status === "created_without_meet") {
    deliveryMessage = [
      "후보자와 회사 참석자에게 Calendar 초대는 보냈지만 Google Meet 링크는 만들지 못했어요.",
      ...(calendarUrl
        ? [`Calendar 일정에서 화상회의 링크를 추가해 주세요: ${calendarUrl}`]
        : ["Calendar 일정에서 화상회의 링크를 추가해 주세요."]),
    ].join("\n");
  } else if (args.calendar.status === "creating") {
    deliveryMessage =
      "미팅 시간은 확정됐어요. Calendar 초대와 Google Meet 링크를 만들고 있으며, 완료되면 후보자와 회사 참석자에게 전달돼요.";
  } else {
    deliveryMessage =
      "미팅 시간은 확정됐어요. Calendar 초대와 Google Meet 링크를 아직 만들지 못했어요. 회사 담당자가 일정 화면에서 다시 시도할 수 있어요.";
  }

  return [companyMessage, deliveryMessage].filter(Boolean).join("\n\n");
}

function clean(value: unknown, maxLength = 320) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validEmail(value: unknown) {
  const email = clean(value).toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function buildMeetingCalendarAttendeeEmails(args: {
  candidateEmail: unknown;
  companyAttendees: unknown;
  organizerCompanyUserId: string;
}) {
  const company = Array.isArray(args.companyAttendees)
    ? args.companyAttendees.flatMap((attendee) => {
        if (!isRecord(attendee)) return [];
        if (clean(attendee.companyUserId, 80) === args.organizerCompanyUserId) {
          return [];
        }
        const email = validEmail(attendee.email);
        return email ? [email] : [];
      })
    : [];
  return Array.from(
    new Set([validEmail(args.candidateEmail), ...company].filter(Boolean))
  );
}
