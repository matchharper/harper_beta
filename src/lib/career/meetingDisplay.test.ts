import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCareerActivityRelativeTime,
  formatCareerMeetingDateTimeRange,
  mergeCreatedAppointment,
  upcomingMeetingFilter,
} from "./meetingDisplay";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import type { TalentMeetingSchedule } from "./meetings/types";

test("date-only appointments display only a date and stay upcoming for the entire KST day", () => {
  const meeting = {
    startAt: "2026-11-02T15:00:00Z",
    endAt: null,
    calendarDate: "2026-11-03",
  };
  assert.equal(
    formatCareerMeetingDateTimeRange({ ...meeting, locale: "ko" }),
    "11월 3일 (화)"
  );
  assert.equal(
    formatCareerMeetingDateTimeRange({ ...meeting, locale: "en" }),
    "Tue, November 3"
  );
  assert.equal(
    upcomingMeetingFilter(new Date("2026-11-03T14:59:00Z")),
    "confirmed_start_at.gte.2026-11-03T14:59:00.000Z,source_refs->>calendarDate.gte.2026-11-03"
  );
  assert.match(
    upcomingMeetingFilter(new Date("2026-11-03T15:00:00Z")),
    /calendarDate.gte.2026-11-04$/
  );
});

test("new appointments replace an expired list preview and preserve an earlier upcoming appointment", () => {
  const item = {
    upcomingMeeting: {
      startAt: "2000-01-01T00:00:00Z",
      endAt: null,
      title: "past",
    },
  } as CareerHistoryOpportunity;
  const schedule = {
    id: "appointment",
    talent_id: "owner",
    role_id: "role",
    scheduling_source: "external",
    content: "",
    timezone: "Asia/Seoul",
    status: "confirmed",
    version: 1,
    source_key: "manual:appointment",
    confirmed_start_at: "2099-01-01T15:00:00Z",
    confirmed_end_at: null,
    title: "면접",
    source_refs: { calendarDate: "2099-01-02" },
  } satisfies TalentMeetingSchedule;
  const updated = mergeCreatedAppointment(item, schedule);
  assert.equal(updated.upcomingMeeting?.calendarDate, "2099-01-02");
  assert.equal(updated.upcomingMeeting?.title, "면접");
  assert.equal(
    mergeCreatedAppointment(updated, {
      ...schedule,
      confirmed_start_at: "2099-01-03T15:00:00Z",
      source_refs: { calendarDate: "2099-01-04" },
    }),
    updated
  );
});

test("formats an upcoming meeting in KST for Korean Career UI", () => {
  assert.equal(
    formatCareerMeetingDateTimeRange({
      endAt: "2026-09-03T07:00:00.000Z",
      locale: "ko",
      startAt: "2026-09-03T06:00:00.000Z",
    }),
    "9월 3일 (목) 오후 3:00–오후 4:00 KST"
  );
});

test("returns null for an invalid meeting timestamp", () => {
  assert.equal(
    formatCareerMeetingDateTimeRange({
      endAt: "2026-09-03T07:00:00.000Z",
      locale: "en",
      startAt: "invalid",
    }),
    null
  );
});

test("appointments crossing midnight show the end date", () => {
  assert.equal(
    formatCareerMeetingDateTimeRange({
      startAt: "2030-01-07T14:30:00Z",
      endAt: "2030-01-07T15:30:00Z",
      locale: "ko",
    }),
    "1월 7일 (월) 오후 11:30–1월 8일 (화) 오전 12:30 KST"
  );
});

test("uses compact relative time for talent role activities from today", () => {
  assert.equal(
    formatCareerActivityRelativeTime(
      "2026-08-31T01:00:00.000Z",
      "ko",
      new Date("2026-08-31T03:15:00.000Z")
    ),
    "2시간 전"
  );
});

test("uses yesterday and compact day labels in KST", () => {
  const now = new Date("2026-08-31T03:00:00.000Z");
  assert.equal(
    formatCareerActivityRelativeTime("2026-08-30T10:00:00.000Z", "ko", now),
    "어제"
  );
  assert.equal(
    formatCareerActivityRelativeTime("2026-08-26T03:00:00.000Z", "ko", now),
    "5d"
  );
});
