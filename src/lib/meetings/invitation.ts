export const MEETING_INVITATION_LINK_MARKER = "[일정 선택 링크]";
export const MAX_CANDIDATE_MEETING_OPTIONS = 5;

export type MeetingInvitationEmailDraft = {
  body: string;
  candidateMessage: string | null;
  locale: "en" | "ko";
  subject: string;
};

export function buildMeetingInvitationSubject(args: {
  companyName: string;
  locale: "en" | "ko";
  roleName: string;
}) {
  return args.locale === "ko"
    ? `${args.companyName} ${args.roleName}: 일정 선택 요청`
    : `${args.companyName} ${args.roleName}: choose a meeting time`;
}

export function buildMeetingInvitationFallback(args: {
  candidateMessage: string | null;
  candidateName: string;
  companyName: string;
  durationMinutes: number;
  locale: "en" | "ko";
  organizerName: string;
  roleName: string;
}): MeetingInvitationEmailDraft {
  if (args.locale === "ko") {
    return {
      body: [
        `안녕하세요 ${args.candidateName}님, 좋은 소식이 있어요.`,
        `앞서 연결 의사를 확인했던 ${args.companyName}의 ${args.roleName} 역할과 관련해 ${args.organizerName}님이 직접 이야기를 나누고 싶어 하셔서 첫 미팅을 연결해드리려고 해요.`,
        `첫 만남은 Google Meet으로 진행할 예정이고, ${args.durationMinutes}분 정도 여유 있게 잡아둘게요. 아래 링크에서 가능한 시간을 선택해 주세요. 원활한 일정 조율을 위해 가능하면 2~3개의 선택지를 보내주시면 감사하겠습니다.`,
        args.candidateMessage,
        MEETING_INVITATION_LINK_MARKER,
        "제출하신 시간 중 하나가 자동으로 확정되며, 이후 Google Meet 링크와 Calendar 초대를 보내드릴게요.",
        "좋은 연결이 되길 바라겠습니다 :)",
        "감사합니다.\nHarper",
      ]
        .filter(Boolean)
        .join("\n\n"),
      candidateMessage: args.candidateMessage,
      locale: args.locale,
      subject: buildMeetingInvitationSubject(args),
    };
  }
  return {
    body: [
      `Hi ${args.candidateName}, I have some good news.`,
      `Following your earlier interest in the ${args.roleName} role at ${args.companyName}, ${args.organizerName} would like to speak with you, and Harper would be glad to coordinate an initial meeting.`,
      `The first conversation will be held over Google Meet, and we will allow ${args.durationMinutes} minutes so there is plenty of time. Please choose the times that work for you using the link below. If possible, sharing two or three options will make coordination easier.`,
      args.candidateMessage,
      MEETING_INVITATION_LINK_MARKER,
      "One of the times you submit will be confirmed automatically. We will then send the Google Meet link and calendar invitation.",
      "We hope this will be a great conversation.",
      "Thank you,\nHarper",
    ]
      .filter(Boolean)
      .join("\n\n"),
    candidateMessage: args.candidateMessage,
    locale: args.locale,
    subject: buildMeetingInvitationSubject(args),
  };
}

export type MeetingInvitationPreviewResponse = {
  email: MeetingInvitationEmailDraft;
  ok: true;
  slotSummary: {
    firstSlotAt: string;
    lastSlotAt: string;
    slotCount: number;
    timezone: string;
  };
};

export type MeetingInvitationQueueResponse = {
  ok: true;
  schedule: import("@/lib/meetings/scheduleDraft").MeetingScheduleDetail;
};

export type PublicMeetingSlot = {
  dateKey: string;
  endAt: string;
  slotId: string;
  startAt: string;
};

export type PublicMeetingInvitation = {
  calendar:
    | import("@/lib/meetings/meetingCalendar").MeetingCalendarDelivery
    | null;
  candidateName: string;
  companyName: string;
  confirmedAt: string | null;
  durationMinutes: number;
  expiresAt: string;
  locale: "en" | "ko";
  message: string | null;
  organizerName: string;
  roleName: string;
  slots: PublicMeetingSlot[];
  state: "available" | "expired" | "no_slots" | "submitted";
  timezone: string;
  title: string;
};

export type PublicMeetingInvitationResponse = {
  invitation: PublicMeetingInvitation;
  ok: true;
};

export type PublicMeetingSubmissionResponse = {
  calendar: import("@/lib/meetings/meetingCalendar").MeetingCalendarDelivery;
  confirmedAt: string;
  durationMinutes: number;
  ok: true;
  timezone: string;
};
