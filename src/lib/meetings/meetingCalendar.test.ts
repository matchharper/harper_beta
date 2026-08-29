import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMeetingCalendarAttendeeEmails,
  buildMeetingCalendarDeliveryNotice,
} from "./meetingCalendar";

test("calendar attendees include the candidate and non-organizer company guests once", () => {
  assert.deepEqual(
    buildMeetingCalendarAttendeeEmails({
      candidateEmail: " Candidate@Example.com ",
      companyAttendees: [
        {
          companyUserId: "organizer-id",
          email: "organizer@example.com",
        },
        { companyUserId: "guest-id", email: "Guest@Example.com" },
        { companyUserId: "duplicate-id", email: "candidate@example.com" },
        { companyUserId: "invalid-id", email: "not-an-email" },
      ],
      organizerCompanyUserId: "organizer-id",
    }),
    ["candidate@example.com", "guest@example.com"]
  );
});

test("calendar attendees fail closed when the candidate email is invalid", () => {
  assert.deepEqual(
    buildMeetingCalendarAttendeeEmails({
      candidateEmail: "invalid",
      companyAttendees: [],
      organizerCompanyUserId: "organizer-id",
    }),
    []
  );
});

test("company confirmation includes only an actual Meet link and Calendar result", () => {
  const delivered = buildMeetingCalendarDeliveryNotice({
    calendar: {
      calendarUrl: "https://calendar.google.com/calendar/event?eid=abc",
      error: null,
      meetUrl: "https://meet.google.com/abc-defg-hij",
      status: "created",
      updatedAt: "2026-08-28T01:00:00.000Z",
    },
    companyMessage: "후보자가 가능한 시간을 알려줬고 미팅 시간을 확정했어요.",
  });
  assert.match(delivered, /후보자와 회사 참석자에게 Calendar 초대를 보냈고/);
  assert.match(delivered, /https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(delivered, /https:\/\/calendar\.google\.com\/calendar\/event/);

  const pending = buildMeetingCalendarDeliveryNotice({
    calendar: {
      calendarUrl: null,
      error: null,
      meetUrl: null,
      status: "creating",
      updatedAt: "2026-08-28T01:00:00.000Z",
    },
    companyMessage: "미팅 시간을 확정했어요.",
  });
  assert.doesNotMatch(pending, /Google Meet: https/);
  assert.match(pending, /만들고 있으며/);
});
