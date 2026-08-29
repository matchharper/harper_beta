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
    meetingPurpose: "가벼운 기술적인 이야기와 서로의 기대 확인",
    organizerName: "Daniel",
    roleName: "FDE",
  });

  assert.equal(email.subject, "Wonderful FDE: 일정 선택 요청");
  assert.match(email.body, /좋은 소식이 있어요/);
  assert.match(
    email.body,
    /이전에 연결 의사를 전해주셨던 Wonderful의 FDE 역할/
  );
  assert.match(
    email.body,
    /Daniel님이 전달드린 정보를 확인하고 직접 이야기 나누고 싶다는 뜻/
  );
  assert.match(email.body, /Google Meet/);
  assert.match(email.body, /60분/);
  assert.match(email.body, /가벼운 기술적인 이야기와 서로의 기대 확인/);
  assert.match(email.body, /2~3개의 선택지/);
  assert.match(email.body, /가능하면 가장 빠른 시간/);
  assert.match(email.body, /서로에게 좋은 기회가 되길 바라요/);
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
    meetingPurpose: "a light technical conversation",
    organizerName: "Richard",
    roleName: "FDE",
  });

  assert.equal(email.subject, "Wonderful Japan FDE: choose a meeting time");
  assert.match(email.body, /I have some good news/);
  assert.match(email.body, /earlier interest in the FDE role/);
  assert.match(email.body, /Richard reviewed the information you shared/);
  assert.match(email.body, /light technical conversation/);
  assert.match(email.body, /two or three options/);
  assert.equal(email.body.split(MEETING_INVITATION_LINK_MARKER).length, 2);
});

test("later process-stage fallback omits the first-connection framing", () => {
  const email = buildMeetingInvitationFallback({
    candidateMessage: null,
    candidateName: "김호진",
    companyName: "Wonderful",
    durationMinutes: 30,
    invitationKind: "process_stage",
    locale: "ko",
    meetingPurpose: "기술 과제와 협업 방식을 함께 이야기하기",
    organizerName: "Daniel",
    processStageName: "1차 기술 인터뷰",
    roleName: "FDE",
  });

  assert.match(email.body, /다음 대화를 준비하고 있어요/);
  assert.match(email.body, /1차 기술 인터뷰 단계에서는/);
  assert.match(email.body, /기술 과제와 협업 방식을 함께 이야기하기/);
  assert.doesNotMatch(email.body, /이전에 연결 의사를/);
  assert.doesNotMatch(email.body, /전달드린 정보를 확인/);
});
