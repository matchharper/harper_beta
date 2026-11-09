import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverMeetingCalendar,
  meetingGoogleEventId,
} from "./calendarDelivery";
import { resolveMeetingCalendarOwner } from "./calendarOwner";
import { GoogleCalendarError } from "@/lib/integrations/googleCalendarError";
import { buildMeetingCalendarAttendeeEmails } from "./meetingCalendar";
import { meetingInstant } from "./coordination";

test("exact appointment timestamps reject missing zones and normalized invalid dates", () => {
  assert.equal(
    meetingInstant("2030-01-01T14:00:00+09:00", "startsAt").toISOString(),
    "2030-01-01T05:00:00.000Z"
  );
  for (const value of [
    "2030-01-01",
    "2030-01-01T14:00:00",
    "2030-02-30T14:00:00+09:00",
    "2030-01-01T25:00:00Z",
  ])
    assert.throws(() => meetingInstant(value, "startsAt"));
});

test("personal Calendar has priority, no-account uses Harper, provider failures never switch hosts", async () => {
  let hostedReads = 0;
  const args = {
    organizerId: "member",
    authConfigId: "config",
    hostedAccountId: "host",
    hostedUserId: "hello",
    personalAccount: async () => "personal",
    getAccount: async (id: string) => {
      hostedReads++;
      return {
        id,
        user_id: "hello",
        status: "ACTIVE",
        toolkit: { slug: "googlecalendar" },
        auth_config: { id: "config" },
      };
    },
  };
  assert.equal((await resolveMeetingCalendarOwner(args)).kind, "personal");
  assert.equal(hostedReads, 0);
  assert.equal(
    (
      await resolveMeetingCalendarOwner({
        ...args,
        personalAccount: async () => {
          throw new GoogleCalendarError(409, "NOT_CONNECTED", "missing");
        },
      })
    ).kind,
    "harper"
  );
  await assert.rejects(
    resolveMeetingCalendarOwner({
      ...args,
      personalAccount: async () => {
        throw new Error("provider outage");
      },
    }),
    /provider outage/
  );
  await assert.rejects(
    resolveMeetingCalendarOwner({
      ...args,
      pinned: { kind: "personal", accountId: "old", userId: "member" },
    }),
    /original meeting Calendar/
  );
  const members = [{ companyUserId: "member", email: "member@example.com" }];
  assert.deepEqual(
    buildMeetingCalendarAttendeeEmails({
      candidateEmail: "candidate@example.com",
      companyAttendees: members,
      organizerCompanyUserId: "",
    }),
    ["candidate@example.com", "member@example.com"]
  );
});

test("uncertain creation reuses one event; reschedule patches it; cancellation is retryable", async () => {
  const events = new Map<string, any>();
  const calls: string[] = [];
  let failAfterCreate = true;
  const request = async ({ path, method, body }: any) => {
    calls.push(method);
    const id = decodeURIComponent(path.split("/").at(-1).split("?")[0]);
    if (method === "GET" && path.includes("?privateExtendedProperty"))
      return { status: 200, data: { items: [] } };
    if (method === "GET")
      return events.has(id)
        ? { status: 200, data: structuredClone(events.get(id)) }
        : { status: 404, data: {} };
    if (method === "POST") {
      assert.equal(body.conferenceData.createRequest.requestId, body.id);
      assert.match(path, /sendUpdates=all/);
      if (events.has(body.id)) return { status: 409, data: {} };
      const event = {
        ...body,
        hangoutLink: "https://meet.google.com/abc-defg-hij",
        htmlLink: "https://calendar.google.com/event",
      };
      events.set(body.id, event);
      if (failAfterCreate) {
        failAfterCreate = false;
        throw new Error("response lost");
      }
      return { status: 200, data: event };
    }
    if (method === "PATCH") {
      const event = { ...events.get(id), ...body };
      events.set(id, event);
      return { status: 200, data: event };
    }
    if (method === "DELETE") {
      events.delete(id);
      return { status: 204, data: {} };
    }
    throw new Error("unexpected request");
  };
  const args = {
    request,
    scheduleId: "schedule",
    version: 2,
    status: "confirmed",
    startAt: "2030-01-01T01:00:00Z",
    endAt: "2030-01-01T02:00:00Z",
    timezone: "Asia/Seoul",
    title: "Interview",
    purpose: "Discuss role",
    attendees: ["company@example.com", "talent@example.com"],
  };
  await assert.rejects(deliverMeetingCalendar(args), /response lost/);
  const retry = await deliverMeetingCalendar(args);
  assert.equal(retry.status, "created");
  assert.equal(events.size, 1);
  assert.equal(calls.filter((c) => c === "POST").length, 1);
  const eventId = meetingGoogleEventId("schedule");
  await deliverMeetingCalendar({
    ...args,
    eventId,
    version: 3,
    startAt: "2030-01-02T01:00:00Z",
    endAt: "2030-01-02T02:00:00Z",
  });
  assert.equal(events.get(eventId).start.dateTime, "2030-01-02T01:00:00Z");
  assert.equal(calls.filter((c) => c === "PATCH").length, 1);
  await deliverMeetingCalendar({
    ...args,
    eventId,
    version: 3,
    startAt: "2030-01-02T01:00:00Z",
    endAt: "2030-01-02T02:00:00Z",
  });
  assert.equal(calls.filter((c) => c === "PATCH").length, 1);
  assert.equal(
    (
      await deliverMeetingCalendar({
        ...args,
        eventId,
        version: 4,
        status: "cancelled",
      })
    ).status,
    "cancelled"
  );
  assert.equal(
    (
      await deliverMeetingCalendar({
        ...args,
        eventId,
        version: 4,
        status: "cancelled",
      })
    ).status,
    "cancelled"
  );
  assert.equal(calls.filter((c) => c === "DELETE").length, 1);
});

test("identity, revision and etag protect existing events before any modification", async () => {
  const args = {
    scheduleId: "s",
    eventId: "event",
    version: 2,
    status: "confirmed",
    startAt: "2030-01-01T01:00:00Z",
    endAt: "2030-01-01T02:00:00Z",
    timezone: "UTC",
    title: "Interview",
    purpose: "Role",
    attendees: ["a@example.com"],
  };
  let writes = 0;
  for (const status of ["confirmed", "cancelled"]) {
    await assert.rejects(
      deliverMeetingCalendar({
        ...args,
        status,
        request: async ({ method }) => {
          if (method !== "GET") writes++;
          return {
            status: 200,
            data: {
              id: "event",
              extendedProperties: {
                private: { harperScheduleId: "someone-else" },
              },
            },
          };
        },
      }),
      /identity mismatch/
    );
  }
  assert.equal(writes, 0);
  await assert.rejects(
    deliverMeetingCalendar({
      ...args,
      request: async () => ({
        status: 200,
        data: {
          id: "event",
          extendedProperties: {
            private: { harperScheduleId: "s", harperMeetingVersion: "3" },
          },
        },
      }),
    }),
    /newer meeting version/
  );
  await assert.rejects(
    deliverMeetingCalendar({
      ...args,
      request: async ({ method, etag }) => {
        if (method === "PATCH") {
          assert.equal(etag, '"revision-one"');
          return { status: 412, data: {} };
        }
        return {
          status: 200,
          data: {
            id: "event",
            etag: '"revision-one"',
            extendedProperties: {
              private: { harperScheduleId: "s", harperMeetingVersion: "1" },
            },
          },
        };
      },
    }),
    /412/
  );
});

test("a pending Meet remains retryable and a missing previously delivered event is not recreated", async () => {
  const args = {
    scheduleId: "s",
    version: 1,
    status: "confirmed",
    startAt: "2030-01-01T01:00:00Z",
    endAt: "2030-01-01T02:00:00Z",
    timezone: "UTC",
    title: "Interview",
    purpose: "Role",
    attendees: ["a@example.com"],
  };
  const pending = {
    id: meetingGoogleEventId("s"),
    extendedProperties: {
      private: { harperScheduleId: "s", harperMeetingVersion: "1" },
    },
    conferenceData: { createRequest: { status: { statusCode: "pending" } } },
  };
  assert.equal(
    (
      await deliverMeetingCalendar({
        ...args,
        request: async () => ({ status: 200, data: pending }),
      })
    ).status,
    "creating"
  );
  await assert.rejects(
    deliverMeetingCalendar({
      ...args,
      eventId: "existing",
      deliveredVersion: 1,
      request: async () => ({ status: 404, data: {} }),
    }),
    /original Calendar event/
  );
});

test("failed Meet generation can be retried on the original invitation", async () => {
  const event = {
    id: "event",
    etag: '"before"',
    extendedProperties: {
      private: { harperScheduleId: "s", harperMeetingVersion: "2" },
    },
    conferenceData: { createRequest: { status: { statusCode: "failure" } } },
  };
  const calls: any[] = [];
  const result = await deliverMeetingCalendar({
    scheduleId: "s",
    eventId: "event",
    version: 2,
    attempt: 4,
    status: "confirmed",
    startAt: "2035-01-01T01:00Z",
    endAt: "2035-01-01T02:00Z",
    timezone: "UTC",
    title: "Interview",
    purpose: "Role",
    attendees: ["a@example.com"],
    request: async (input) => {
      calls.push(input);
      return {
        status: 200,
        data:
          input.method === "GET"
            ? event
            : { ...event, hangoutLink: "https://meet.google.com/abc-defg-hij" },
      };
    },
  });
  assert.equal(result.status, "created");
  assert.deepEqual(
    calls.map((c) => c.method),
    ["GET", "PATCH"]
  );
  assert.equal(calls[1].body.conferenceData.createRequest.requestId, "event-4");
  assert.equal(calls[1].etag, '"before"');
});
