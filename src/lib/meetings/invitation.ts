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
  invitationKind?: "first_company_conversation" | "process_stage";
  locale: "en" | "ko";
  meetingPurpose?: string;
  organizerName: string;
  processStageName?: string | null;
  roleName: string;
}): MeetingInvitationEmailDraft {
  const meetingPurpose =
    args.meetingPurpose?.trim() || "서로의 기대와 경험을 편하게 나누는 첫 대화";
  const isFirstCompanyConversation =
    args.invitationKind !== "process_stage";
  const processStageName = args.processStageName?.trim() || "다음 단계";
  if (args.locale === "ko") {
    return {
      body: [
        isFirstCompanyConversation
          ? `안녕하세요 ${args.candidateName}님, 좋은 소식이 있어요.`
          : `안녕하세요 ${args.candidateName}님, ${args.companyName}의 ${args.roleName} 역할과 관련해 다음 대화를 준비하고 있어요.`,
        isFirstCompanyConversation
          ? `이전에 연결 의사를 전해주셨던 ${args.companyName}의 ${args.roleName} 역할과 관련해 ${args.organizerName}님이 전달드린 정보를 확인하고 직접 이야기 나누고 싶다는 뜻을 전해주셨어요.`
          : `${processStageName} 단계에서는 ${meetingPurpose}를 주제로 ${args.durationMinutes}분 정도 이야기 나누고 싶다고 해요.`,
        isFirstCompanyConversation
          ? `첫 미팅은 ${meetingPurpose}를 주제로 ${args.durationMinutes}분 정도 진행하고 싶다고 해요. 회사에서 가능한 시간을 공유해주셔서, 바로 만나보실 수 있게 아래 링크에서 편한 시간을 선택해주시면 Google Meet으로 초대해드릴게요. 가능하면 2~3개의 선택지를 보내주시면 일정 조율에 도움이 됩니다.`
          : `회사에서 가능한 시간을 공유해주셔서, 아래 링크에서 편한 시간 2~3개를 선택해주시면 Google Meet으로 초대해드릴게요.`,
        args.candidateMessage,
        MEETING_INVITATION_LINK_MARKER,
        "제출하신 시간 중 하나가 자동으로 확정되며, 이후 Google Meet 링크와 Calendar 초대를 보내드릴게요.",
        "이번 대화가 서로에게 좋은 기회가 되길 바라요.",
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
      isFirstCompanyConversation
        ? `Hi ${args.candidateName}, I have some good news.`
        : `Hi ${args.candidateName}, we are preparing the next conversation for the ${args.roleName} role at ${args.companyName}.`,
      isFirstCompanyConversation
        ? `Following your earlier interest in the ${args.roleName} role at ${args.companyName}, ${args.organizerName} reviewed the information you shared and would like to meet you.`
        : `For the ${processStageName} stage, the team would like to spend about ${args.durationMinutes} minutes discussing ${meetingPurpose}.`,
      isFirstCompanyConversation
        ? `They would like to spend about ${args.durationMinutes} minutes discussing ${meetingPurpose}. The company has shared its availability; choose the times that work for you using the link below and Harper will send a Google Meet invitation. If possible, sharing two or three options will make coordination easier.`
        : `The company has shared its availability; choose two or three times that work for you using the link below and Harper will send a Google Meet invitation.`,
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
  companyLogoUrl: string | null;
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
