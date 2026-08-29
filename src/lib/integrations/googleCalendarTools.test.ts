import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildGoogleCalendarCreateEventArguments,
  buildGoogleCalendarEventLookupArguments,
  formatCalendarLocalDateTime,
  hasGoogleCalendarListErrors,
  parseCreatedGoogleCalendarEvent,
  parseGoogleCalendarBusyBlocks,
} from "./googleCalendarTools";

function opaqueProviderIdentifier(kind: "calendar" | "event", value: string) {
  return createHash("sha256")
    .update(`harper.google-calendar.busy.${kind}:${value}`)
    .digest("hex");
}

test("calendar sync keeps only blocking events and deduplicates calendar copies", () => {
  const blocks = parseGoogleCalendarBusyBlocks({
    fallbackTimezone: "Asia/Seoul",
    payload: {
      events: [
        {
          source_calendar_id: "primary",
          event: {
            id: "busy",
            start: { dateTime: "2026-08-28T10:00:00+09:00" },
            end: { dateTime: "2026-08-28T11:00:00+09:00" },
            status: "confirmed",
            transparency: "opaque",
          },
        },
        {
          source_calendar_id: "primary",
          event: {
            id: "busy",
            start: { dateTime: "2026-08-28T10:00:00+09:00" },
            end: { dateTime: "2026-08-28T11:00:00+09:00" },
          },
        },
        {
          source_calendar_id: "primary",
          event: {
            id: "free",
            start: { dateTime: "2026-08-28T12:00:00+09:00" },
            end: { dateTime: "2026-08-28T13:00:00+09:00" },
            transparency: "transparent",
          },
        },
        {
          source_calendar_id: "primary",
          event: {
            id: "declined",
            attendees: [{ self: true, responseStatus: "declined" }],
            start: { dateTime: "2026-08-28T14:00:00+09:00" },
            end: { dateTime: "2026-08-28T15:00:00+09:00" },
          },
        },
      ],
    },
    windowEnd: new Date("2026-09-10T00:00:00.000Z"),
    windowStart: new Date("2026-08-27T00:00:00.000Z"),
  });
  assert.deepEqual(blocks, [
    {
      allDay: false,
      endAt: "2026-08-28T02:00:00.000Z",
      externalCalendarId: opaqueProviderIdentifier("calendar", "primary"),
      externalEventId: opaqueProviderIdentifier("event", "busy"),
      startAt: "2026-08-28T01:00:00.000Z",
    },
  ]);
});

test("partial all-calendar failures are detectable before saving an incomplete sync", () => {
  assert.equal(hasGoogleCalendarListErrors({ errors_by_calendar: {} }), false);
  assert.equal(
    hasGoogleCalendarListErrors({
      errors_by_calendar: { "private@example.com": "permission denied" },
    }),
    true
  );
});

test("all-day events use the employee timezone and remain end-exclusive", () => {
  const blocks = parseGoogleCalendarBusyBlocks({
    fallbackTimezone: "Asia/Seoul",
    payload: {
      events: [
        {
          source_calendar_id: "primary",
          event: {
            id: "all-day",
            start: { date: "2026-08-28" },
            end: { date: "2026-08-29" },
          },
        },
      ],
    },
    windowEnd: new Date("2026-09-10T00:00:00.000Z"),
    windowStart: new Date("2026-08-27T00:00:00.000Z"),
  });
  assert.equal(blocks[0].startAt, "2026-08-27T15:00:00.000Z");
  assert.equal(blocks[0].endAt, "2026-08-28T15:00:00.000Z");
  assert.equal(blocks[0].allDay, true);
});

test("event creation uses the requested local timezone and trusts only Google URLs", () => {
  assert.equal(
    formatCalendarLocalDateTime(
      new Date("2026-08-28T01:30:00.000Z"),
      "Asia/Seoul"
    ),
    "2026-08-28T10:30:00"
  );
  assert.deepEqual(
    parseCreatedGoogleCalendarEvent({
      display_url: "https://calendar.google.com/calendar/event?eid=test",
      response_data: {
        id: "event-1",
        hangoutLink: "https://meet.google.com/abc-defg-hij",
      },
    }),
    {
      calendarUrl: "https://calendar.google.com/calendar/event?eid=test",
      conferencePending: false,
      eventId: "event-1",
      meetUrl: "https://meet.google.com/abc-defg-hij",
    }
  );
  assert.equal(
    parseCreatedGoogleCalendarEvent({
      display_url: "https://attacker.test/event",
      response_data: { id: "event-2", hangoutLink: "javascript:alert(1)" },
    })?.calendarUrl,
    null
  );
  assert.deepEqual(
    parseCreatedGoogleCalendarEvent({
      data: {
        event_id: "event-3",
        hangout_link: "https://meet.google.com/snake-case-link",
        html_link: "https://calendar.google.com/calendar/event?eid=snake",
      },
    }),
    {
      calendarUrl: "https://calendar.google.com/calendar/event?eid=snake",
      conferencePending: false,
      eventId: "event-3",
      meetUrl: "https://meet.google.com/snake-case-link",
    }
  );
});

test("event arguments invite both sides, request Meet, notify guests, and remain idempotent", () => {
  const startAt = new Date("2026-08-28T01:30:00.000Z");
  const endAt = new Date("2026-08-28T02:30:00.000Z");
  assert.deepEqual(
    buildGoogleCalendarEventLookupArguments({
      endAt,
      scheduleId: "schedule-1",
      startAt,
    }),
    {
      calendarId: "primary",
      maxResults: 10,
      privateExtendedProperty: "harperScheduleId=schedule-1",
      showDeleted: false,
      singleEvents: true,
      timeMax: "2026-08-29T02:30:00.000Z",
      timeMin: "2026-08-27T01:30:00.000Z",
    }
  );
  const create = buildGoogleCalendarCreateEventArguments({
    attendees: [
      "candidate@example.com",
      "teammate@example.com",
      "candidate@example.com",
    ],
    endAt,
    meetingPurpose: "가벼운 기술적인 이야기와 서로의 기대 확인",
    scheduleId: "schedule-1",
    startAt,
    summary: "Company <> Candidate Intro",
    timezone: "Asia/Seoul",
  });
  assert.deepEqual(create.attendees, [
    "candidate@example.com",
    "teammate@example.com",
  ]);
  assert.equal(create.create_meeting_room, true);
  assert.equal(create.send_updates, "all");
  assert.match(create.description, /가벼운 기술적인 이야기/);
  assert.match(create.description, /서로의 기대와 경험을 편하게 나눠보는 자리/);
  assert.equal(create.start_datetime, "2026-08-28T10:30:00");
  assert.equal(create.end_datetime, "2026-08-28T11:30:00");
  assert.deepEqual(create.extended_properties, {
    private: { harperScheduleId: "schedule-1" },
  });

  const processStageCreate = buildGoogleCalendarCreateEventArguments({
    attendees: ["candidate@example.com"],
    endAt,
    invitationKind: "process_stage",
    meetingPurpose: "기술 과제와 협업 방식을 함께 이야기하기",
    processStageName: "1차 기술 인터뷰",
    scheduleId: "schedule-2",
    startAt,
    summary: "Company <> Candidate Intro",
    timezone: "Asia/Seoul",
  });
  assert.match(processStageCreate.description, /1차 기술 인터뷰 단계/);
  assert.doesNotMatch(processStageCreate.description, /서로의 기대와 경험/);
});

test("conference entry points and pending creation are preserved", () => {
  assert.deepEqual(
    parseCreatedGoogleCalendarEvent({
      display_url: "https://attacker.test/event",
      response_data: {
        conferenceData: {
          createRequest: { status: { statusCode: "pending" } },
          entryPoints: [
            {
              entryPointType: "video",
              uri: "https://meet.google.com/pending-room",
            },
          ],
        },
        htmlLink: "https://calendar.google.com/calendar/event?eid=safe",
        id: "event-pending",
      },
    }),
    {
      calendarUrl: "https://calendar.google.com/calendar/event?eid=safe",
      conferencePending: true,
      eventId: "event-pending",
      meetUrl: "https://meet.google.com/pending-room",
    }
  );
  assert.equal(
    parseCreatedGoogleCalendarEvent({
      response_data: {
        conferenceData: {
          createRequest: { status: { statusCode: "pending" } },
        },
        id: "event-still-pending",
      },
    })?.conferencePending,
    true
  );
});
