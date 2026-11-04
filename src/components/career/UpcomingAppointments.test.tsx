import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import { AppointmentList } from "./UpcomingAppointments";
import type { TalentMeetingSchedule } from "@/lib/career/meetings/types";

export const appointmentFixture: TalentMeetingSchedule[] = [
  {
    id: "appointment-1",
    talent_id: "candidate",
    role_id: "role-1",
    scheduling_source: "external",
    title: "기술 인터뷰",
    content:
      "배포 아키텍처 사례 하나를 준비해 주세요.\n\n[미팅 참여](https://meet.example.test/platform)",
    timezone: "Asia/Seoul",
    confirmed_start_at: "2030-01-07T00:00:00Z",
    confirmed_end_at: "2030-01-07T01:00:00Z",
    status: "confirmed",
    version: 1,
    source_key: "email:1",
    source_refs: {},
    role: {
      name: "Platform Engineer",
      company_workspace: { company_name: "Atlas" },
    },
  },
  {
    id: "appointment-2",
    talent_id: "candidate",
    role_id: null,
    scheduling_source: "external",
    title: "커리어 멘토링",
    content: "최근 프로젝트와 고민을 정리해 오세요.",
    timezone: "Asia/Seoul",
    confirmed_start_at: "2030-01-08T06:00:00Z",
    confirmed_end_at: null,
    status: "confirmed",
    version: 1,
    source_key: "chat:2",
    source_refs: {},
  },
];

test("actual appointment rows expose expandable facts, related role and exact join URL without inventing an end time", () => {
  const markup = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <AppointmentList schedules={appointmentFixture} onOpenRole={() => {}} />
    </MessagesProvider>
  );
  const document = new JSDOM(markup).window.document;
  assert.equal(document.querySelectorAll("details").length, 2);
  assert.equal(document.querySelectorAll("summary").length, 2);
  assert.match(
    document.querySelector("summary")!.textContent!,
    /Atlas · Platform Engineer/
  );
  assert.match(
    document.querySelector("summary")!.textContent!,
    /오전 9:00.*오전 10:00/
  );
  assert.doesNotMatch(
    document.querySelectorAll("summary")[1].textContent!,
    /–/
  );
  assert.equal(
    document.querySelector("a")!.getAttribute("href"),
    "https://meet.example.test/platform"
  );
  assert.equal(document.querySelectorAll("button").length, 1);
  assert.equal(document.querySelector("button")!.textContent, "관련 포지션");
  assert.doesNotMatch(
    document.body.textContent!,
    /source_key|appointment-1|confirmed|version/
  );
});

test("appointment actions use the English dictionary when English is selected", () => {
  const markup = renderToStaticMarkup(
    <MessagesProvider locale="en">
      <AppointmentList schedules={appointmentFixture} onOpenRole={() => {}} />
    </MessagesProvider>
  );
  const document = new JSDOM(markup).window.document;
  assert.equal(
    document.querySelector("button")!.textContent,
    "Related position"
  );
  assert.match(document.querySelector("summary")!.textContent!, /9:00 AM/);
});
