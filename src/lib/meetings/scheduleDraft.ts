import type { SavedMeetingAvailability } from "@/lib/meetings/availability";
import { formatMeetingAvailabilitySummary } from "@/lib/meetings/availability";

export const DEFAULT_INTERVIEW_DURATION_MINUTES = 60;
export const DEFAULT_MEETING_OFFER_WINDOW_DAYS = 14;
export const DEFAULT_MEETING_PROVIDER = "google_meet" as const;

export type MeetingScheduleAttendee = {
  companyUserId: string;
  email: string;
  name: string;
};

export type MeetingScheduleDraftConfig = {
  companyAttendees: MeetingScheduleAttendee[];
  conferenceProvider: typeof DEFAULT_MEETING_PROVIDER;
  durationMinutes: number;
  offerWindowDays: number;
  organizer: MeetingScheduleAttendee;
  title: string;
};

export type MeetingScheduleAdditionalMessage = {
  sourceText: string;
  visibility: "both" | "candidate" | "internal";
};

export type PreparedMeetingScheduleDraft = {
  additionalMessage: MeetingScheduleAdditionalMessage | null;
  availability: SavedMeetingAvailability | null;
  config: MeetingScheduleDraftConfig;
  draftBlocker: "availability_missing" | "organizer_email_missing" | null;
};

export type MeetingScheduleDetail = {
  availability: SavedMeetingAvailability | null;
  candidate: {
    email: string | null;
    name: string;
    talentId: string;
  };
  companyName: string;
  confirmedEndAt: string | null;
  confirmedStartAt: string | null;
  config: MeetingScheduleDraftConfig;
  recommendationId: string;
  role: {
    name: string;
    roleId: string;
  };
  round: {
    additionalMessage: MeetingScheduleAdditionalMessage | null;
    candidateOptions: Array<{
      dateKey: string;
      endAt: string;
      startAt: string;
    }>;
    delivery: {
      error: string | null;
      sentAt: string | null;
      status: string;
    } | null;
    expiresAt: string | null;
    id: string;
    roundNumber: number;
    selection: {
      companyMessage: string;
      method: string;
      selectedAt: string;
      timezone: string | null;
    } | null;
    status: string;
    submittedAt: string | null;
    timezone: string | null;
  };
  scheduleId: string;
  status: string;
  updatedAt: string;
  version: number;
  workspaceId: string;
};

export type MeetingScheduleDetailResponse = {
  ok: true;
  schedule: MeetingScheduleDetail;
};

export type MeetingScheduleMutationResponse = MeetingScheduleDetailResponse;

export type MeetingScheduleListItem = {
  candidateName: string;
  roleName: string;
  roundStatus: string;
  scheduleId: string;
  status: string;
  title: string;
  updatedAt: string;
};

export type MeetingScheduleListResponse = {
  items: MeetingScheduleListItem[];
  ok: true;
  workspaceId: string;
};

function clean(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function boundedLabel(value: string | null | undefined, fallback: string) {
  return clean(value).slice(0, 80) || fallback;
}

export function buildDefaultInterviewTitle(args: {
  candidateName: string | null | undefined;
  companyName: string | null | undefined;
}) {
  const companyName = boundedLabel(args.companyName, "Company");
  const candidateName = boundedLabel(args.candidateName, "Candidate");
  return `${companyName} <> ${candidateName} Intro`.slice(0, 200);
}

export function resolveMeetingOrganizerEmail(args: {
  organizerCompanyUserId: string;
  requesterEmail: string | null | undefined;
  requesterUserId: string;
  storedEmail: string | null | undefined;
}) {
  const storedEmail = clean(args.storedEmail).toLowerCase();
  if (storedEmail) return storedEmail;
  return args.organizerCompanyUserId === args.requesterUserId
    ? clean(args.requesterEmail).toLowerCase()
    : "";
}

export function resolveMeetingOrganizerName(args: {
  actorLabel: string | null | undefined;
  organizerCompanyUserId: string;
  requesterUserId: string;
  storedName: string | null | undefined;
}) {
  const actorLabel = clean(args.actorLabel);
  const storedName = clean(args.storedName);
  if (args.organizerCompanyUserId === args.requesterUserId) {
    return actorLabel || storedName || "현재 사용자";
  }
  return storedName || "일정 담당자";
}

export function buildOrgMeetingSchedulePath(args: {
  scheduleId: string;
  workspaceId: string;
}) {
  const params = new URLSearchParams({
    dialog: "interview-schedule",
    orgId: clean(args.workspaceId),
    scheduleId: clean(args.scheduleId),
  });
  return `/org/inbox?${params.toString()}`;
}

export function normalizeInterviewDuration(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_INTERVIEW_DURATION_MINUTES;
  }
  const duration = Number(value);
  if (
    !Number.isSafeInteger(duration) ||
    duration < 15 ||
    duration > 240 ||
    duration % 15 !== 0
  ) {
    throw new Error("미팅 시간은 15분부터 240분까지 15분 단위로 정해 주세요.");
  }
  return duration;
}

export function formatPreparedMeetingScheduleConfirmation(args: {
  availabilityActionLink?: string;
  candidateName: string;
  draft: PreparedMeetingScheduleDraft;
}) {
  const { availabilityActionLink, candidateName, draft } = args;
  const { config } = draft;
  const attendeeText = config.companyAttendees
    .map((attendee) => `${attendee.name}님 (${attendee.email})`)
    .join(", ");

  if (draft.draftBlocker === "organizer_email_missing") {
    return `${candidateName}님과의 미팅을 조율하려면 ${config.organizer.name}님의 회사 이메일이 필요해요. [Members](team)에서 이메일을 확인한 뒤 다시 말씀해 주세요. 아직 ${candidateName}님께는 연락하지 않았어요.`;
  }

  if (draft.draftBlocker === "availability_missing") {
    const scheduleAction = availabilityActionLink
      ? `${availabilityActionLink}에서`
      : "Integrations의 인터뷰 일정에서";
    return [
      `${candidateName}님과의 미팅, 조율해드릴게요. 먼저 ${config.organizer.name}님이 보통 언제 가능하신지 알려주세요.`,
      "",
      `가능 시간을 정해주시면 미팅은 ${config.durationMinutes}분으로 잡고, 참석자는 우선 ${attendeeText}로 둘게요. 향후 ${config.offerWindowDays / 7}주 안에서 가능한 선택지를 추려 ${candidateName}님께 보내드릴게요.`,
      "",
      `아직 ${candidateName}님께는 아무 연락도 보내지 않았어요. ${scheduleAction} 설정하거나 “평일 오전 8시부터 오후 7시까지 가능해”처럼 이 대화에서 편하게 알려주세요.`,
    ].join("\n");
  }

  const availabilitySummary = draft.availability
    ? formatMeetingAvailabilitySummary(draft.availability)
    : "가능 시간 미설정";
  const additionalMessage = draft.additionalMessage
    ? draft.additionalMessage.visibility === "internal"
      ? ` 말씀해주신 “${draft.additionalMessage.sourceText}”는 후보자에게 보내지 않고 시간 선택에만 참고할게요.`
      : ` “${draft.additionalMessage.sourceText}”라는 말씀도 후보자에게 자연스럽게 전할게요.`
    : "";

  return [
    `설정해두신 시간을 보면 ${availabilitySummary} 사이에서 향후 ${config.offerWindowDays / 7}주 안의 선택지를 추릴 수 있어요. 날짜별로 빼둔 시간과 그사이에 새로 잡히는 Harper 미팅은 후보자가 고를 수 없게 할게요.`,
    "",
    `첫 미팅은 ${config.durationMinutes}분으로 넉넉히 잡고, 참석자는 우선 ${attendeeText}로 둘게요. 미팅은 Google Meet으로 진행할 예정이에요.${additionalMessage}`,
    "",
    `이대로 ${candidateName}님과 연결하고, 가능한 시간을 물어볼 메일을 준비할까요? 참석자나 미팅 길이, 전하고 싶은 말을 바꾸고 싶다면 지금 편하게 말씀해 주세요. 아직 ${candidateName}님께 메일이 보내지는 것은 아니에요.`,
  ].join("\n");
}
