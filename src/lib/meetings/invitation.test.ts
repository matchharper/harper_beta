import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMeetingInvitationFallback,
  buildMeetingInvitationSubject,
  MEETING_INVITATION_LINK_MARKER,
} from "@/lib/meetings/invitation";

test("invitation subject never reuses the internal meeting title", () => {
  assert.equal(
    buildMeetingInvitationSubject({
      companyName: "Wonderful",
      locale: "ko",
      roleName: "FDE",
    }),
    "Wonderful FDE: 일정 선택 요청"
  );
});

test("Korean invitation fallback reads like a recruiting introduction", () => {
  const email = buildMeetingInvitationFallback({
    candidateMessage: "가능하면 가장 빠른 시간으로 부탁드린다고 합니다.",
    candidateName: "김호진",
    companyName: "Wonderful",
    durationMinutes: 60,
    locale: "ko",
    organizerName: "Daniel",
    roleName: "FDE",
  });

  assert.equal(email.subject, "Wonderful FDE: 일정 선택 요청");
  assert.match(email.body, /좋은 소식이 있어요/);
  assert.match(email.body, /앞서 연결 의사를 확인했던 Wonderful의 FDE 역할/);
  assert.match(email.body, /Daniel님이 직접 이야기를 나누고 싶어/);
  assert.match(email.body, /Google Meet/);
  assert.match(email.body, /60분/);
  assert.match(email.body, /2~3개의 선택지/);
  assert.match(email.body, /가능하면 가장 빠른 시간/);
  assert.match(email.body, /좋은 연결이 되길 바라겠습니다/);
  assert.equal(email.body.split(MEETING_INVITATION_LINK_MARKER).length, 2);
  assert.doesNotMatch(email.body, /초안|상태|프로세스|최대 5개/);
});

test("English invitation fallback preserves the same human context", () => {
  const email = buildMeetingInvitationFallback({
    candidateMessage: null,
    candidateName: "Ito",
    companyName: "Wonderful Japan",
    durationMinutes: 45,
    locale: "en",
    organizerName: "Richard",
    roleName: "FDE",
  });

  assert.equal(email.subject, "Wonderful Japan FDE: choose a meeting time");
  assert.match(email.body, /I have some good news/);
  assert.match(email.body, /earlier interest in the FDE role/);
  assert.match(email.body, /Richard would like to speak with you/);
  assert.match(email.body, /two or three options/);
  assert.equal(email.body.split(MEETING_INVITATION_LINK_MARKER).length, 2);
});
