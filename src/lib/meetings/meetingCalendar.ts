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
