import assert from "node:assert/strict";
import test from "node:test";
import { buildMeetingCalendarAttendeeEmails } from "./meetingCalendar";

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
