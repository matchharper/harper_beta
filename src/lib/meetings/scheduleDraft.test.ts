import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrgMeetingSchedulePath,
  buildDefaultInterviewTitle,
  formatPreparedMeetingScheduleConfirmation,
  normalizeInterviewDuration,
  resolveMeetingOrganizerEmail,
  resolveMeetingOrganizerName,
  type PreparedMeetingScheduleDraft,
} from "@/lib/meetings/scheduleDraft";

const organizer = {
  companyUserId: "4d4595ef-cf98-469a-b8d6-886f2ae36e14",
  email: "minji@example.com",
  name: "민지",
};

function draft(
  overrides: Partial<PreparedMeetingScheduleDraft> = {}
): PreparedMeetingScheduleDraft {
  return {
    additionalMessage: null,
    availability: {
      dateOverrides: { "2026-08-28": [] },
      timezone: "Asia/Seoul",
      updatedAt: "2026-08-25T00:00:00.000Z",
      version: 1,
      weeklyRules: {
        "1": [{ end: "19:00", start: "08:00" }],
        "2": [{ end: "19:00", start: "08:00" }],
        "3": [{ end: "19:00", start: "08:00" }],
        "4": [{ end: "19:00", start: "08:00" }],
        "5": [{ end: "19:00", start: "08:00" }],
        "6": [],
        "7": [],
      },
    },
    config: {
      companyAttendees: [organizer],
      conferenceProvider: "google_meet",
      durationMinutes: 60,
      offerWindowDays: 14,
      organizer,
      title: "Wonderful Japan <> Ito Intro",
    },
    draftBlocker: null,
    ...overrides,
  };
}

test("uses the concise company and candidate intro title", () => {
  assert.equal(
    buildDefaultInterviewTitle({
      candidateName: "Ito",
      companyName: "Wonderful Japan",
    }),
    "Wonderful Japan <> Ito Intro"
  );
});

test("never substitutes an editor email for another organizer", () => {
  assert.equal(
    resolveMeetingOrganizerEmail({
      organizerCompanyUserId: "organizer-2",
      requesterEmail: "editor@example.com",
      requesterUserId: "editor-1",
      storedEmail: null,
    }),
    ""
  );
  assert.equal(
    resolveMeetingOrganizerEmail({
      organizerCompanyUserId: "editor-1",
      requesterEmail: "EDITOR@EXAMPLE.COM",
      requesterUserId: "editor-1",
      storedEmail: null,
    }),
    "editor@example.com"
  );
});

test("uses the active surface name for the requesting organizer", () => {
  assert.equal(
    resolveMeetingOrganizerName({
      actorLabel: "Daniel",
      organizerCompanyUserId: "editor-1",
      requesterUserId: "editor-1",
      storedName: "김호진",
    }),
    "Daniel"
  );
});

test("never substitutes an editor name for another organizer", () => {
  assert.equal(
    resolveMeetingOrganizerName({
      actorLabel: "Daniel",
      organizerCompanyUserId: "organizer-2",
      requesterUserId: "editor-1",
      storedName: "민지",
    }),
    "민지"
  );
  assert.equal(
    resolveMeetingOrganizerName({
      actorLabel: "Daniel",
      organizerCompanyUserId: "organizer-2",
      requesterUserId: "editor-1",
      storedName: null,
    }),
    "일정 담당자"
  );
});

test("company schedule detail path preserves the workspace and schedule", () => {
  const path = buildOrgMeetingSchedulePath({
    scheduleId: "schedule id",
    workspaceId: "workspace id",
  });
  const url = new URL(path, "https://matchharper.com");

  assert.equal(url.pathname, "/org/inbox");
  assert.equal(url.searchParams.get("dialog"), "interview-schedule");
  assert.equal(url.searchParams.get("orgId"), "workspace id");
  assert.equal(url.searchParams.get("scheduleId"), "schedule id");
});

test("defaults duration to 60 minutes and validates explicit edits", () => {
  assert.equal(normalizeInterviewDuration(undefined), 60);
  assert.equal(normalizeInterviewDuration(45), 45);
  assert.throws(() => normalizeInterviewDuration(50), /15분 단위/);
});

test("confirmation presents defaults together without asking each field", () => {
  const confirmation = formatPreparedMeetingScheduleConfirmation({
    candidateName: "Ito",
    draft: draft(),
  });

  assert.match(confirmation, /평일 08:00–19:00/);
  assert.match(confirmation, /새로 잡히는 Harper 미팅/);
  assert.match(confirmation, /향후 2주/);
  assert.match(confirmation, /60분/);
  assert.match(confirmation, /민지님 \(minji@example\.com\)/);
  assert.match(confirmation, /Google Meet/);
  assert.match(confirmation, /편하게 말씀해 주세요/);
  assert.match(confirmation, /아직 Ito님께 메일이 보내지는 것은 아니에요/);
  assert.doesNotMatch(confirmation, /기본안|일정 요청 초안|연결 상태/);
  assert.doesNotMatch(confirmation, /제목은/);
});

test("confirmation distinguishes internal notes from candidate-facing copy", () => {
  const confirmation = formatPreparedMeetingScheduleConfirmation({
    candidateName: "Ito",
    draft: draft({
      additionalMessage: {
        sourceText: "최대한 빠른 시간으로 잡아주세요.",
        visibility: "internal",
      },
    }),
  });

  assert.match(confirmation, /후보자에게 보내지 않고 시간 선택에만 참고/);
  assert.doesNotMatch(confirmation, /후보자에게 자연스럽게 전할게요/);
});

test("missing availability asks for one prerequisite without staging approval", () => {
  const confirmation = formatPreparedMeetingScheduleConfirmation({
    availabilityActionLink:
      "[스케줄 열기](https://matchharper.com/org/settings?dialog=interview-availability)",
    candidateName: "Ito",
    draft: draft({ availability: null, draftBlocker: "availability_missing" }),
  });

  assert.match(confirmation, /보통 언제 가능하신지 알려주세요/);
  assert.match(confirmation, /60분/);
  assert.match(confirmation, /스케줄 열기/);
  assert.match(confirmation, /아직 Ito님께는 아무 연락도 보내지 않았어요/);
  assert.match(confirmation, /이 대화에서 편하게 알려주세요/);
  assert.doesNotMatch(confirmation, /연결 상태|초안/);
  assert.doesNotMatch(confirmation, /저장할까요/);
});
