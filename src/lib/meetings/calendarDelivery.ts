import { createHash } from "node:crypto";
import {
  parseCreatedGoogleCalendarEvent,
  type GoogleCalendarEventResult,
} from "@/lib/integrations/googleCalendarTools";

type Request = (args: {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  etag?: string;
}) => Promise<{ status: number; data: any }>;
export const meetingGoogleEventId = (id: string) =>
  `h${createHash("sha256").update(`harper-meeting:${id}`).digest("hex")}`;

/** The stable Google event ID handles provider success followed by a local timeout. */
export async function deliverMeetingCalendar(args: {
  request: Request;
  scheduleId: string;
  version: number;
  status: string;
  startAt: string;
  endAt: string;
  timezone: string;
  title: string;
  purpose: string;
  attendees: string[];
  eventId?: string | null;
  deliveredVersion?: number | null;
  attempt?: number;
}): Promise<{
  status: "created" | "created_without_meet" | "creating" | "cancelled";
  calendar?: GoogleCalendarEventResult;
}> {
  let eventId = args.eventId || meetingGoogleEventId(args.scheduleId);
  const base = "/calendar/v3/calendars/primary/events";
  let result = await args.request({
    method: "GET",
    path: `${base}/${encodeURIComponent(eventId)}`,
  });
  if (![200, 404, 410].includes(result.status))
    throw new Error(`Calendar lookup failed (${result.status})`);
  if (result.status !== 200 && !args.eventId) {
    // Reuse events from the older random-ID delivery path as well.
    const found = await args.request({
      method: "GET",
      path: `${base}?privateExtendedProperty=${encodeURIComponent(`harperScheduleId=${args.scheduleId}`)}&showDeleted=false`,
    });
    if (found.status !== 200 || found.data.nextPageToken)
      throw new Error("Calendar event lookup incomplete");
    const events = (found.data.items ?? []).filter(
      (event: any) => event.status !== "cancelled"
    );
    if (events.length > 1)
      throw new Error(
        "Multiple Calendar events exist for this meeting; no new invitation was sent"
      );
    if (events.length) {
      eventId = events[0].id;
      result = { status: 200, data: events[0] };
    }
  }
  const assertIdentity = () => {
    if (result.status === 200 && result.data.status !== "cancelled") {
      if (
        result.data.extendedProperties?.private?.harperScheduleId !==
        args.scheduleId
      )
        throw new Error("Calendar event identity mismatch");
      if (
        Number(result.data.extendedProperties?.private?.harperMeetingVersion) >
        args.version
      )
        throw new Error("A newer meeting version is already on Calendar");
    }
  };
  assertIdentity();
  if (args.status === "cancelled") {
    if (result.status === 200 && result.data.status !== "cancelled") {
      const removed = await args.request({
        method: "DELETE",
        path: `${base}/${encodeURIComponent(eventId)}?sendUpdates=all`,
        etag: result.data.etag,
      });
      if (![200, 204, 404, 410].includes(removed.status))
        throw new Error(`Calendar cancellation failed (${removed.status})`);
    }
    return { status: "cancelled" };
  }
  if (result.status === 410 || result.data?.status === "cancelled")
    throw new Error(
      "The Calendar event was cancelled outside Harper; no replacement was created"
    );
  const body = {
    summary: args.title,
    description: args.purpose,
    start: { dateTime: args.startAt, timeZone: args.timezone },
    end: { dateTime: args.endAt, timeZone: args.timezone },
    attendees: [...new Set(args.attendees)].map((email) => ({ email })),
    extendedProperties: {
      private: {
        harperScheduleId: args.scheduleId,
        harperMeetingVersion: String(args.version),
      },
    },
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: true,
  };
  if (result.status === 404) {
    if (args.eventId || args.deliveredVersion)
      throw new Error(
        "The original Calendar event is unavailable; no replacement was created"
      );
    result = await args.request({
      method: "POST",
      path: `${base}?conferenceDataVersion=1&sendUpdates=all`,
      body: {
        ...body,
        id: eventId,
        conferenceData: {
          createRequest: {
            requestId: eventId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });
    if (result.status === 409)
      result = await args.request({
        method: "GET",
        path: `${base}/${encodeURIComponent(eventId)}`,
      });
  }
  assertIdentity();
  if (
    result.status === 200 &&
    result.data.extendedProperties?.private?.harperMeetingVersion !==
      String(args.version)
  ) {
    result = await args.request({
      method: "PATCH",
      path: `${base}/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`,
      body,
      etag: result.data.etag,
    });
  }
  if (![200, 201].includes(result.status))
    throw new Error(`Calendar delivery failed (${result.status})`);
  if (
    result.data.extendedProperties?.private?.harperScheduleId !==
    args.scheduleId
  )
    throw new Error("Calendar event identity mismatch");
  const calendar = parseCreatedGoogleCalendarEvent(result.data);
  if (!calendar) throw new Error("Calendar returned no event identifier");
  if (!calendar.meetUrl && !calendar.conferencePending && args.eventId) {
    const conference = await args.request({
      method: "PATCH",
      path: `${base}/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`,
      etag: result.data.etag,
      body: {
        conferenceData: {
          createRequest: {
            requestId: `${eventId}-${args.attempt ?? args.version}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });
    if (conference.status !== 200)
      throw new Error(`Meet creation failed (${conference.status})`);
    const retried = parseCreatedGoogleCalendarEvent(conference.data);
    if (!retried || retried.eventId !== eventId)
      throw new Error("Calendar conference response identity mismatch");
    return {
      calendar: retried,
      status: retried.meetUrl
        ? "created"
        : retried.conferencePending
          ? "creating"
          : "created_without_meet",
    };
  }
  return {
    calendar,
    status: calendar.meetUrl
      ? "created"
      : calendar.conferencePending
        ? "creating"
        : "created_without_meet",
  };
}
