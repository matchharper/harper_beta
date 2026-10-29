import assert from "node:assert/strict";
import test from "node:test";
import {
  fillOrgIntroTemplate,
  findUnknownOrgIntroFields,
  normalizeOrgMessageTemplateContent,
  orgIntroBookingLinkAsText,
  withOrgIntroBookingLink,
} from "./messageTemplates";

const link = {
  label: "인터뷰 가능 시간 선택하기",
  url: "https://example.invalid/meeting/token",
};
const values = {
  bookingLink: "{면접 예약 링크}",
  candidateName: "가나",
  companyName: "다라",
  roleName: "백엔드",
  senderName: "마바",
};

test("the booking link goes where the team wrote it", () => {
  const body = fillOrgIntroTemplate(
    "{후보자 이름}님 안녕하세요.\n\n{면접 예약 링크}\n\nHarper 드림",
    values
  );
  assert.equal(
    withOrgIntroBookingLink(body, link),
    `가나님 안녕하세요.\n\n[${link.label}](${link.url})\n\nHarper 드림`
  );
});

test("without the field the link goes at the end, once", () => {
  const withLink = withOrgIntroBookingLink("안녕하세요.\n\nHarper 드림", link);
  assert.equal(
    withLink,
    `안녕하세요.\n\nHarper 드림\n\n[${link.label}](${link.url})`
  );
  // A retried send keeps the body it already stored.
  assert.equal(withOrgIntroBookingLink(withLink, link), withLink);
  assert.equal(
    orgIntroBookingLinkAsText(withLink, link),
    `안녕하세요.\n\nHarper 드림\n\n${link.label}: ${link.url}`
  );
});

test("with no link the field and its empty line are dropped", () => {
  const body = fillOrgIntroTemplate(
    "안녕하세요.\n\n{면접 예약 링크}\n\nHarper 드림",
    { ...values, bookingLink: "" }
  );
  assert.equal(body, "안녕하세요.\n\nHarper 드림");
  assert.equal(withOrgIntroBookingLink(body, null), body);
});

test("the link field is a known value; a typo is not", () => {
  assert.deepEqual(findUnknownOrgIntroFields("{면접 예약 링크}"), []);
  assert.deepEqual(findUnknownOrgIntroFields("{면접예약링크}"), [
    "{면접예약링크}",
  ]);
});

test("an intro template keeps the booking link's topic and length", () => {
  assert.deepEqual(
    normalizeOrgMessageTemplateContent("intro_email", {
      body: "본문",
      durationMinutes: 45,
      meetingPurpose: "첫 대화",
      subject: "제목",
    }),
    {
      body: "본문",
      durationMinutes: 45,
      meetingPurpose: "첫 대화",
      subject: "제목",
    }
  );
  // Older templates without them still load, with the usual length.
  assert.deepEqual(
    normalizeOrgMessageTemplateContent("intro_email", {
      body: "본문",
      subject: "제목",
    }),
    { body: "본문", durationMinutes: 60, meetingPurpose: "", subject: "제목" }
  );
});
