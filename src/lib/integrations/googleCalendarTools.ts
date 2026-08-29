import { createHash } from "node:crypto";
import { meetingLocalTimeToUtc } from "@/lib/meetings/slots";

export const GOOGLE_CALENDAR_TOOL_VERSION = "20260826_00";
export const GOOGLE_CALENDAR_LIST_EVENTS_TOOL = "GOOGLECALENDAR_EVENTS_LIST";
export const GOOGLE_CALENDAR_LIST_ALL_EVENTS_TOOL =
  "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS";
export const GOOGLE_CALENDAR_CREATE_EVENT_TOOL = "GOOGLECALENDAR_CREATE_EVENT";

export type GoogleCalendarBusyBlock = {
  allDay: boolean;
  endAt: string;
  externalCalendarId: string;
  externalEventId: string;
  startAt: string;
};

export type GoogleCalendarEventResult = {
  calendarUrl: string | null;
  conferencePending: boolean;
  eventId: string;
  meetUrl: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value: unknown, maxLength = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function opaqueProviderIdentifier(kind: "calendar" | "event", value: string) {
  return createHash("sha256")
    .update(`harper.google-calendar.busy.${kind}:${value}`)
    .digest("hex");
}

function dateTimeRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function localDateTimeToUtc(value: string, timezone: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/
  );
  if (!match) return null;
  return meetingLocalTimeToUtc({
    dateKey: `${match[1]}-${match[2]}-${match[3]}`,
    minutes: Number(match[4]) * 60 + Number(match[5]),
    timezone,
  });
}

function parseEventBoundary(
  value: unknown,
  fallbackTimezone: string,
  allDay: boolean
) {
  const boundary = dateTimeRecord(value);
  if (!boundary) return null;
  const dateTime = clean(boundary.dateTime, 80);
  if (dateTime) {
    if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(dateTime)) {
      const date = new Date(dateTime);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return localDateTimeToUtc(
      dateTime,
      clean(boundary.timeZone, 128) || fallbackTimezone
    );
  }
  const dateKey = clean(boundary.date, 10);
  if (!allDay || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  return meetingLocalTimeToUtc({
    dateKey,
    minutes: 0,
    timezone: clean(boundary.timeZone, 128) || fallbackTimezone,
  });
}

function selfDeclined(attendees: unknown) {
  return (
    Array.isArray(attendees) &&
    attendees.some(
      (attendee) =>
        isRecord(attendee) &&
        attendee.self === true &&
        clean(attendee.responseStatus, 40) === "declined"
    )
  );
}

export function parseGoogleCalendarBusyBlocks(args: {
  fallbackTimezone: string;
  payload: unknown;
  windowEnd: Date;
  windowStart: Date;
}) {
  if (!isRecord(args.payload) || !Array.isArray(args.payload.events)) return [];
  const blocks = new Map<string, GoogleCalendarBusyBlock>();
  for (const wrapped of args.payload.events) {
    if (!isRecord(wrapped) || !isRecord(wrapped.event)) continue;
    const event = wrapped.event;
    const sourceCalendarId = clean(wrapped.source_calendar_id, 1_024);
    const sourceEventId = clean(event.id, 1_024);
    const eventType = clean(event.eventType, 80);
    if (
      !sourceCalendarId ||
      !sourceEventId ||
      clean(event.status, 40) === "cancelled" ||
      clean(event.transparency, 40) === "transparent" ||
      ["birthday", "workingLocation"].includes(eventType) ||
      selfDeclined(event.attendees)
    ) {
      continue;
    }
    const startRecord = dateTimeRecord(event.start);
    const allDay = Boolean(startRecord && clean(startRecord.date, 10));
    const start = parseEventBoundary(
      event.start,
      args.fallbackTimezone,
      allDay
    );
    const end = parseEventBoundary(event.end, args.fallbackTimezone, allDay);
    if (!start || !end || start >= end) continue;
    const boundedStart = new Date(
      Math.max(start.getTime(), args.windowStart.getTime())
    );
    const boundedEnd = new Date(
      Math.min(end.getTime(), args.windowEnd.getTime())
    );
    if (boundedStart >= boundedEnd) continue;
    const externalCalendarId = opaqueProviderIdentifier(
      "calendar",
      sourceCalendarId
    );
    const externalEventId = opaqueProviderIdentifier("event", sourceEventId);
    const key = `${externalCalendarId}\u0000${externalEventId}`;
    blocks.set(key, {
      allDay,
      endAt: boundedEnd.toISOString(),
      externalCalendarId,
      externalEventId,
      startAt: boundedStart.toISOString(),
    });
  }
  return Array.from(blocks.values()).sort((left, right) =>
    left.startAt.localeCompare(right.startAt)
  );
}

export function hasGoogleCalendarListErrors(payload: unknown) {
  return Boolean(
    isRecord(payload) &&
    isRecord(payload.errors_by_calendar) &&
    Object.keys(payload.errors_by_calendar).length > 0
  );
}

export function isValidCalendarTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return Boolean(value.trim());
  } catch {
    return false;
  }
}

export function formatCalendarLocalDateTime(value: Date, timezone: string) {
  if (Number.isNaN(value.getTime()) || !isValidCalendarTimezone(timezone)) {
    throw new Error("Invalid calendar date or timezone");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

function assertMeetingEventInput(args: {
  endAt: Date;
  scheduleId: string;
  startAt: Date;
}) {
  if (
    Number.isNaN(args.startAt.getTime()) ||
    Number.isNaN(args.endAt.getTime()) ||
    args.startAt >= args.endAt ||
    !args.scheduleId.trim() ||
    args.scheduleId.length > 80
  ) {
    throw new Error("Invalid meeting calendar event input");
  }
}

export function buildGoogleCalendarEventLookupArguments(args: {
  endAt: Date;
  scheduleId: string;
  startAt: Date;
}) {
  assertMeetingEventInput(args);
  return {
    calendarId: "primary",
    maxResults: 10,
    privateExtendedProperty: `harperScheduleId=${args.scheduleId}`,
    showDeleted: false,
    singleEvents: true,
    timeMax: new Date(args.endAt.getTime() + 86_400_000).toISOString(),
    timeMin: new Date(args.startAt.getTime() - 86_400_000).toISOString(),
  };
}

export function buildGoogleCalendarCreateEventArguments(args: {
  attendees: string[];
  endAt: Date;
  invitationKind?: "first_company_conversation" | "process_stage" | null;
  meetingPurpose?: string | null;
  processStageName?: string | null;
  scheduleId: string;
  startAt: Date;
  summary: string;
  timezone: string;
}) {
  assertMeetingEventInput(args);
  if (!isValidCalendarTimezone(args.timezone) || args.attendees.length === 0) {
    throw new Error("Invalid meeting calendar attendees or timezone");
  }
  const meetingPurpose = clean(args.meetingPurpose, 600);
  const processStageName = clean(args.processStageName, 80);
  const isProcessStage = args.invitationKind === "process_stage";
  return {
    attendees: Array.from(new Set(args.attendees)),
    calendar_id: "primary",
    create_meeting_room: true,
    description: meetingPurpose
      ? isProcessStage && processStageName
        ? `${processStageName} 단계에서 “${meetingPurpose}”를 주제로 이야기 나누는 자리예요.`
        : `미팅의 주제는 “${meetingPurpose}”예요. 서로의 기대와 경험을 편하게 나눠보는 자리예요.`
      : "서로의 기대와 경험을 편하게 나눠보는 자리예요.",
    end_datetime: formatCalendarLocalDateTime(args.endAt, args.timezone),
    eventType: "default",
    exclude_organizer: false,
    extended_properties: {
      private: { harperScheduleId: args.scheduleId },
    },
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: true,
    send_updates: "all",
    start_datetime: formatCalendarLocalDateTime(args.startAt, args.timezone),
    summary: clean(args.summary, 200),
    timezone: args.timezone,
    transparency: "opaque",
    visibility: "default",
  };
}

function safeGoogleUrl(value: unknown, kind: "calendar" | "meet") {
  const raw = clean(value, 2_048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (kind === "meet") {
      return url.hostname === "meet.google.com" ? url.toString() : null;
    }
    return /(?:^|\.)google\.com$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseEventResult(event: unknown, displayUrl?: unknown) {
  if (!isRecord(event)) return null;
  const eventId = clean(event.id, 1_024) || clean(event.event_id, 1_024);
  if (!eventId) return null;
  const conferenceData = isRecord(event.conferenceData)
    ? event.conferenceData
    : isRecord(event.conference_data)
      ? event.conference_data
      : null;
  const createRequest = isRecord(conferenceData?.createRequest)
    ? conferenceData.createRequest
    : isRecord(conferenceData?.create_request)
      ? conferenceData.create_request
      : null;
  const createStatusValue = isRecord(createRequest?.status)
    ? clean(
        createRequest.status.statusCode ?? createRequest.status.status_code,
        40
      )
    : clean(createRequest?.status, 40);
  const createStatus = createStatusValue.toLowerCase();
  const entryPoints = Array.isArray(conferenceData?.entryPoints)
    ? conferenceData.entryPoints
    : Array.isArray(conferenceData?.entry_points)
      ? conferenceData.entry_points
      : [];
  const entryPointMeetUrl =
    entryPoints.flatMap((entryPoint) => {
      if (!isRecord(entryPoint)) return [];
      const url = safeGoogleUrl(entryPoint.uri ?? entryPoint.url, "meet");
      return url ? [url] : [];
    })[0] ?? null;
  return {
    calendarUrl:
      safeGoogleUrl(displayUrl, "calendar") ??
      safeGoogleUrl(event.display_url, "calendar") ??
      safeGoogleUrl(event.displayUrl, "calendar") ??
      safeGoogleUrl(event.htmlLink, "calendar") ??
      safeGoogleUrl(event.html_link, "calendar"),
    conferencePending: createStatus === "pending",
    eventId,
    // Composio's Calendar toolkit returns hangout_link, while the Google API
    // response itself uses hangoutLink. Accept both so a generated Meet link is
    // persisted and shown to both parties instead of being treated as missing.
    meetUrl:
      safeGoogleUrl(event.hangoutLink, "meet") ??
      safeGoogleUrl(event.hangout_link, "meet") ??
      entryPointMeetUrl,
  } satisfies GoogleCalendarEventResult;
}

export function parseCreatedGoogleCalendarEvent(payload: unknown) {
  if (!isRecord(payload)) return null;
  return parseEventResult(
    payload.response_data ?? payload.responseData ?? payload.data ?? payload,
    payload.display_url ?? payload.displayUrl
  );
}

export function parseExistingGoogleCalendarEvent(payload: unknown) {
  if (!isRecord(payload)) return null;
  const nested = isRecord(payload.response_data)
    ? payload.response_data
    : isRecord(payload.data)
      ? payload.data
      : payload;
  if (!Array.isArray(nested.items)) return null;
  for (const item of nested.items) {
    const parsed = parseEventResult(
      isRecord(item) && isRecord(item.event) ? item.event : item
    );
    if (parsed) return parsed;
  }
  return null;
}
