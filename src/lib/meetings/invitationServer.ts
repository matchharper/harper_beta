import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import {
  MAX_CANDIDATE_MEETING_OPTIONS,
  MEETING_INVITATION_LINK_MARKER,
  type MeetingInvitationPreviewResponse,
  type PublicMeetingInvitationResponse,
  type PublicMeetingSlot,
  type PublicMeetingSubmissionResponse,
} from "@/lib/meetings/invitation";
import { generateMeetingInvitationEmail } from "@/lib/meetings/invitationCopy";
import {
  selectMeetingOption,
  selectMeetingOptionDeterministically,
} from "@/lib/meetings/selection";
import { fetchMeetingScheduleDetail } from "@/lib/meetings/scheduleDraftServer";
import { computeCurrentMeetingSlots } from "@/lib/meetings/slotsServer";
import { insertOrgAgentMessage } from "@/lib/org/agent/store";
import { OrgHttpError } from "@/lib/org/server";
import { sendHarperSlackThreadReply } from "@/lib/org/slackHarper";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Json } from "@/types/database.types";

const INVITATION_QUEUE_TYPE = "meeting_schedule_candidate_invitation";

type InvitationSnapshot = {
  availabilityVersion: number;
  candidate: { email: string; name: string };
  candidateMessage: string | null;
  companyName: string;
  createdAt: string;
  durationMinutes: number;
  email: { body: string; subject: string; to: string };
  locale: "en" | "ko";
  organizerName: string;
  roleName: string;
  timezone: string;
  title: string;
  version: 1;
  windowEnd: string;
  windowStart: string;
};

type InvitationContext = {
  additionalMessage: unknown;
  companyAttendees: unknown;
  confirmedStartAt: string | null;
  expiresAt: string;
  invitationSnapshot: InvitationSnapshot;
  organizerCompanyUserId: string;
  roundId: string;
  roundStatus: string;
  scheduleId: string;
  scheduleStatus: string;
  selectionSnapshot: unknown;
  sourceCompanyMessageId: number | null;
  submittedAt: string | null;
  workspaceId: string;
};

export class MeetingInvitationHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function clean(value: unknown, maxLength = 10_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeLocale(value: unknown): "en" | "ko" {
  return clean(value).toLowerCase().startsWith("ko") ? "ko" : "en";
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function slotId(
  token: string,
  roundId: string,
  startAt: string,
  endAt: string
) {
  return createHmac("sha256", token)
    .update(`${roundId}|${startAt}|${endAt}`)
    .digest("base64url");
}

function parseSnapshot(value: unknown): InvitationSnapshot | null {
  if (!isRecord(value)) return null;
  const candidate = isRecord(value.candidate) ? value.candidate : null;
  const email = isRecord(value.email) ? value.email : null;
  const locale = normalizeLocale(value.locale);
  const snapshot: InvitationSnapshot = {
    availabilityVersion: Number(value.availabilityVersion),
    candidate: {
      email: clean(candidate?.email, 320).toLowerCase(),
      name: clean(candidate?.name, 80),
    },
    candidateMessage: clean(value.candidateMessage, 2_000) || null,
    companyName: clean(value.companyName, 160),
    createdAt: clean(value.createdAt, 80),
    durationMinutes: Number(value.durationMinutes),
    email: {
      body: clean(email?.body, 5_000),
      subject: clean(email?.subject, 180),
      to: clean(email?.to, 320).toLowerCase(),
    },
    locale,
    organizerName: clean(value.organizerName, 80),
    roleName: clean(value.roleName, 160),
    timezone: clean(value.timezone, 128),
    title: clean(value.title, 200),
    version: 1,
    windowEnd: clean(value.windowEnd, 80),
    windowStart: clean(value.windowStart, 80),
  };
  if (
    !snapshot.candidate.email ||
    !snapshot.candidate.name ||
    !snapshot.companyName ||
    !snapshot.email.body ||
    !snapshot.email.subject ||
    !snapshot.timezone ||
    !snapshot.windowStart ||
    !snapshot.windowEnd ||
    !Number.isSafeInteger(snapshot.durationMinutes) ||
    snapshot.durationMinutes <= 0 ||
    !Number.isSafeInteger(snapshot.availabilityVersion) ||
    snapshot.availabilityVersion <= 0
  ) {
    return null;
  }
  return snapshot;
}

function candidateVisibleMessage(value: unknown) {
  if (!isRecord(value)) return null;
  const visibility = clean(value.visibility);
  if (!new Set(["both", "candidate"]).has(visibility)) return null;
  return clean(value.sourceText, 2_000) || null;
}

function selectionMessage(value: unknown) {
  if (!isRecord(value)) return null;
  return clean(value.companyMessage, 800) || null;
}

function selectionTimezone(value: unknown) {
  return isRecord(value) ? clean(value.timezone, 128) || null : null;
}

function renderInvitationLink(args: {
  body: string;
  locale: "en" | "ko";
  url: string;
}) {
  const markdownLink =
    args.locale === "ko"
      ? `[인터뷰 가능 시간 선택하기](${args.url})`
      : `[Select your interview availability](${args.url})`;
  if (args.body.includes(MEETING_INVITATION_LINK_MARKER)) {
    return args.body.replace(MEETING_INVITATION_LINK_MARKER, markdownLink);
  }
  return `${args.body}\n\n${markdownLink}`.trim();
}

async function candidateLocale(talentId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await (admin.from("talent_setting" as any) as any)
    .select("preferred_locale, setting_locale")
    .eq("user_id", talentId)
    .maybeSingle();
  if (error) throw error;
  return normalizeLocale(data?.preferred_locale ?? data?.setting_locale);
}

async function calculateCompanyPreviewSlots(args: {
  schedule: Awaited<ReturnType<typeof fetchMeetingScheduleDetail>>["schedule"];
  windowEnd: Date;
  windowStart: Date;
}) {
  const admin = getSupabaseAdmin();
  const result = await computeCurrentMeetingSlots({
    admin,
    companyAttendees: args.schedule.config.companyAttendees,
    durationMinutes: args.schedule.config.durationMinutes,
    organizerCompanyUserId: args.schedule.config.organizer.companyUserId,
    scheduleId: args.schedule.scheduleId,
    windowEnd: args.windowEnd,
    windowStart: args.windowStart,
    workspaceId: args.schedule.workspaceId,
  });
  if (!result.availability) {
    throw new OrgHttpError(
      409,
      "일정 담당자의 가능 시간을 먼저 설정해 주세요. 후보자에게는 아직 메일을 보내지 않았어요."
    );
  }
  if (result.slots.length === 0) {
    throw new OrgHttpError(
      409,
      "현재 설정과 이미 확정된 미팅을 기준으로 후보자에게 제안할 시간이 없어요. 가능 시간을 넓힌 뒤 다시 준비해 주세요."
    );
  }
  return result;
}

export async function prepareMeetingInvitationPreview(args: {
  scheduleId: string;
  user: User;
  workspaceId: string;
}): Promise<MeetingInvitationPreviewResponse> {
  const { schedule } = await fetchMeetingScheduleDetail(args);
  if (schedule.status !== "preparing" || schedule.round.status !== "draft") {
    throw new OrgHttpError(409, "이미 후보자에게 전달을 시작한 일정이에요.");
  }
  if (!schedule.candidate.email) {
    throw new OrgHttpError(
      409,
      "후보자의 이메일을 확인할 수 없어 일정 요청을 준비하지 못했어요."
    );
  }
  const windowStart = new Date();
  const windowEnd = new Date(
    windowStart.getTime() + schedule.config.offerWindowDays * 86_400_000
  );
  const result = await calculateCompanyPreviewSlots({
    schedule,
    windowEnd,
    windowStart,
  });
  const locale = await candidateLocale(schedule.candidate.talentId);
  const email = await generateMeetingInvitationEmail({
    candidateMessage: candidateVisibleMessage(schedule.round.additionalMessage),
    candidateName: schedule.candidate.name,
    companyName: schedule.companyName,
    durationMinutes: schedule.config.durationMinutes,
    locale,
    organizerName: schedule.config.organizer.name,
    roleName: schedule.role.name,
  });
  return {
    email,
    ok: true,
    slotSummary: {
      firstSlotAt: result.slots[0].startAt,
      lastSlotAt: result.slots.at(-1)?.startAt ?? result.slots[0].startAt,
      slotCount: result.slots.length,
      timezone: result.availability.timezone,
    },
  };
}

export async function queueMeetingInvitation(args: {
  baseUrl: string;
  body: unknown;
  candidateMessage: unknown;
  expectedVersion: unknown;
  scheduleId: string;
  subject: unknown;
  user: User;
  workspaceId: string;
}) {
  const expectedVersion = Number(args.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new OrgHttpError(400, "일정 요청의 최신 버전을 확인해 주세요.");
  }
  const { schedule } = await fetchMeetingScheduleDetail({
    scheduleId: args.scheduleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  if (schedule.status !== "preparing" || schedule.round.status !== "draft") {
    throw new OrgHttpError(409, "이미 후보자에게 전달을 시작한 일정이에요.");
  }
  if (schedule.version !== expectedVersion) {
    throw new OrgHttpError(
      409,
      "다른 화면에서 일정 초안이 바뀌었어요. 최신 내용을 다시 불러와 주세요."
    );
  }
  if (!schedule.candidate.email) {
    throw new OrgHttpError(
      409,
      "후보자의 이메일을 확인할 수 없어 일정 요청을 보내지 못했어요."
    );
  }
  const subject = clean(args.subject, 180).replace(/[\r\n]+/g, " ");
  const previewBody = clean(args.body, 5_000);
  const localizedCandidateMessage = clean(args.candidateMessage, 2_000) || null;
  if (!subject || !previewBody) {
    throw new OrgHttpError(
      400,
      "후보자에게 보낼 메일 제목과 본문을 확인해 주세요."
    );
  }

  const windowStart = new Date();
  const windowEnd = new Date(
    windowStart.getTime() + schedule.config.offerWindowDays * 86_400_000
  );
  const result = await calculateCompanyPreviewSlots({
    schedule,
    windowEnd,
    windowStart,
  });
  const locale = await candidateLocale(schedule.candidate.talentId);
  const token = randomBytes(32).toString("base64url");
  const baseUrl = args.baseUrl.replace(/\/+$/, "");
  const invitationUrl = `${baseUrl}/meeting/${encodeURIComponent(token)}`;
  const body = renderInvitationLink({
    body: previewBody,
    locale,
    url: invitationUrl,
  });
  const createdAt = windowStart.toISOString();
  const snapshot: InvitationSnapshot = {
    availabilityVersion: result.availability.version,
    candidate: {
      email: schedule.candidate.email,
      name: schedule.candidate.name,
    },
    candidateMessage: candidateVisibleMessage(schedule.round.additionalMessage)
      ? localizedCandidateMessage
      : null,
    companyName: schedule.companyName,
    createdAt,
    durationMinutes: schedule.config.durationMinutes,
    email: { body: previewBody, subject, to: schedule.candidate.email },
    locale,
    organizerName: schedule.config.organizer.name,
    roleName: schedule.role.name,
    timezone: result.availability.timezone,
    title: schedule.config.title,
    version: 1,
    windowEnd: windowEnd.toISOString(),
    windowStart: createdAt,
  };
  const queuePayload = {
    body,
    locale,
    meetingScheduleRoundId: schedule.round.id,
    meetingScheduleId: schedule.scheduleId,
    subject,
    to: schedule.candidate.email,
  };
  const admin = getSupabaseAdmin();
  const { error } = await (admin.rpc as any)(
    "queue_meeting_schedule_invitation_v1",
    {
      p_company_workspace_id: schedule.workspaceId,
      p_expected_schedule_version: expectedVersion,
      p_invitation_expires_at: windowEnd.toISOString(),
      p_invitation_snapshot: snapshot as unknown as Json,
      p_public_token_hash: tokenHash(token),
      p_queue_payload: queuePayload as unknown as Json,
      p_schedule_id: schedule.scheduleId,
    }
  );
  if (error?.code === "40001") {
    throw new OrgHttpError(
      409,
      "다른 화면에서 일정이 바뀌었어요. 최신 내용을 다시 불러와 주세요."
    );
  }
  if (error?.code === "55000") {
    throw new OrgHttpError(409, "이미 후보자에게 전달을 시작한 일정이에요.");
  }
  if (error) throw error;
  return fetchMeetingScheduleDetail({
    scheduleId: schedule.scheduleId,
    user: args.user,
    workspaceId: schedule.workspaceId,
  });
}

async function loadInvitationContext(
  token: string
): Promise<InvitationContext> {
  const admin = getSupabaseAdmin();
  const { data: round, error: roundError } = await (
    admin.from("meeting_schedule_rounds" as any) as any
  )
    .select(
      "id, schedule_id, status, additional_message, invitation_expires_at, invitation_snapshot, selection_snapshot, source_company_message_id, submitted_at"
    )
    .eq("public_token_hash", tokenHash(token))
    .maybeSingle();
  if (roundError) throw roundError;
  if (!round) {
    throw new MeetingInvitationHttpError(
      404,
      "일정 선택 링크를 찾지 못했어요. 링크를 다시 확인해 주세요."
    );
  }
  const snapshot = parseSnapshot(round.invitation_snapshot);
  if (!snapshot) {
    throw new MeetingInvitationHttpError(
      410,
      "이 일정 선택 링크는 더 이상 사용할 수 없어요."
    );
  }
  const { data: schedule, error: scheduleError } = await (
    admin.from("meeting_schedules" as any) as any
  )
    .select(
      "id, company_workspace_id, organizer_company_user_id, company_attendees, status, active_round_id, confirmed_start_at"
    )
    .eq("id", round.schedule_id)
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!schedule || schedule.active_round_id !== round.id) {
    throw new MeetingInvitationHttpError(
      410,
      "이 일정 선택 링크는 더 이상 사용할 수 없어요."
    );
  }
  return {
    additionalMessage: round.additional_message,
    companyAttendees: schedule.company_attendees,
    confirmedStartAt: clean(schedule.confirmed_start_at) || null,
    expiresAt: clean(round.invitation_expires_at),
    invitationSnapshot: snapshot,
    organizerCompanyUserId: clean(schedule.organizer_company_user_id),
    roundId: clean(round.id),
    roundStatus: clean(round.status),
    scheduleId: clean(schedule.id),
    scheduleStatus: clean(schedule.status),
    selectionSnapshot: round.selection_snapshot,
    sourceCompanyMessageId: Number.isSafeInteger(
      Number(round.source_company_message_id)
    )
      ? Number(round.source_company_message_id)
      : null,
    submittedAt: clean(round.submitted_at) || null,
    workspaceId: clean(schedule.company_workspace_id),
  };
}

export async function notifyCompanyOfMeetingConfirmation(args: {
  companyMessage: string;
  roundId: string;
  sourceCompanyMessageId: number | null;
  workspaceId: string;
}) {
  if (!args.sourceCompanyMessageId || !clean(args.companyMessage, 800)) return;
  const admin = getSupabaseAdmin();
  const metadata = {
    meetingScheduleRoundId: args.roundId,
    source: "meeting_schedule_confirmation",
  };
  const { data: existing, error: existingError } = await (
    admin.from("company_messages" as any) as any
  )
    .select("id")
    .eq("company_workspace_id", args.workspaceId)
    .contains("metadata", metadata)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const { data: sourceMessage, error: sourceError } = await (
    admin.from("company_messages" as any) as any
  )
    .select("conversation_id, role_id, slack_thread_id")
    .eq("id", args.sourceCompanyMessageId)
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceMessage?.conversation_id) return;
  const { data: conversation, error: conversationError } = await (
    admin.from("company_conversations" as any) as any
  )
    .select("*")
    .eq("id", sourceMessage.conversation_id)
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) return;

  let slackMessageTs: string | null = null;
  let slackUserId: string | null = null;
  if (sourceMessage.slack_thread_id) {
    try {
      const posted = await sendHarperSlackThreadReply({
        idempotencyKey: `meeting:${args.roundId}:company_schedule_notice:slack`,
        text: args.companyMessage,
        threadId: sourceMessage.slack_thread_id,
        workspaceId: args.workspaceId,
      });
      slackMessageTs = posted.slackMessageTs;
      slackUserId = posted.botUserId;
    } catch (error) {
      console.error("[meeting-schedule/company-confirmation-slack]", error);
    }
  }
  await insertOrgAgentMessage({
    admin,
    content: args.companyMessage,
    conversation,
    messageType: sourceMessage.slack_thread_id ? "slack" : "chat",
    metadata,
    role: "assistant",
    roleId: sourceMessage.role_id,
    slackMessageTs,
    slackThreadId: sourceMessage.slack_thread_id,
    slackUserId,
  });
}

async function availablePublicSlots(token: string, context: InvitationContext) {
  const snapshot = context.invitationSnapshot;
  const result = await computeCurrentMeetingSlots({
    companyAttendees: context.companyAttendees,
    durationMinutes: snapshot.durationMinutes,
    organizerCompanyUserId: context.organizerCompanyUserId,
    scheduleId: context.scheduleId,
    windowEnd: new Date(snapshot.windowEnd),
    windowStart: new Date(
      Math.max(Date.now(), new Date(snapshot.windowStart).getTime())
    ),
    workspaceId: context.workspaceId,
  });
  return {
    availabilityVersion: result.availability?.version ?? 0,
    slots: result.slots.map(
      (slot): PublicMeetingSlot => ({
        ...slot,
        slotId: slotId(token, context.roundId, slot.startAt, slot.endAt),
      })
    ),
    timezone: result.availability?.timezone ?? snapshot.timezone,
  };
}

export async function fetchPublicMeetingInvitation(
  tokenValue: string
): Promise<PublicMeetingInvitationResponse> {
  const token = clean(tokenValue, 200);
  if (!token) {
    throw new MeetingInvitationHttpError(
      404,
      "일정 선택 링크를 확인해 주세요."
    );
  }
  const context = await loadInvitationContext(token);
  const snapshot = context.invitationSnapshot;
  const submitted = Boolean(
    context.submittedAt || context.scheduleStatus === "confirmed"
  );
  const expired =
    !context.expiresAt || new Date(context.expiresAt) <= new Date();
  let slots: PublicMeetingSlot[] = [];
  let timezone =
    selectionTimezone(context.selectionSnapshot) ?? snapshot.timezone;
  let state: "available" | "expired" | "no_slots" | "submitted";
  if (submitted) {
    state = "submitted";
  } else if (
    expired ||
    context.scheduleStatus !== "awaiting_talent" ||
    !new Set(["queued", "sent"]).has(context.roundStatus)
  ) {
    state = "expired";
  } else {
    const available = await availablePublicSlots(token, context);
    slots = available.slots;
    timezone = available.timezone;
    state = slots.length > 0 ? "available" : "no_slots";
  }

  return {
    invitation: {
      candidateName: snapshot.candidate.name,
      companyName: snapshot.companyName,
      confirmedAt: context.confirmedStartAt,
      durationMinutes: snapshot.durationMinutes,
      expiresAt: context.expiresAt,
      locale: snapshot.locale,
      message: snapshot.candidateMessage,
      organizerName: snapshot.organizerName,
      roleName: snapshot.roleName,
      slots,
      state,
      timezone,
      title: snapshot.title,
    },
    ok: true,
  };
}

export async function submitPublicMeetingOptions(args: {
  slotIds: unknown;
  token: string;
}): Promise<PublicMeetingSubmissionResponse> {
  const token = clean(args.token, 200);
  const requestedSlotIds = Array.isArray(args.slotIds)
    ? Array.from(
        new Set(args.slotIds.map((item) => clean(item, 200)).filter(Boolean))
      )
    : [];
  if (
    requestedSlotIds.length < 1 ||
    requestedSlotIds.length > MAX_CANDIDATE_MEETING_OPTIONS
  ) {
    throw new MeetingInvitationHttpError(
      400,
      `가능한 시간을 1개부터 ${MAX_CANDIDATE_MEETING_OPTIONS}개까지 선택해 주세요.`
    );
  }
  let context = await loadInvitationContext(token);
  if (context.submittedAt || context.scheduleStatus === "confirmed") {
    throw new MeetingInvitationHttpError(
      409,
      "이미 제출한 일정은 수정할 수 없어요."
    );
  }
  if (
    !context.expiresAt ||
    new Date(context.expiresAt) <= new Date() ||
    context.scheduleStatus !== "awaiting_talent"
  ) {
    throw new MeetingInvitationHttpError(
      410,
      "이 일정 선택 링크는 만료됐어요."
    );
  }

  let available = await availablePublicSlots(token, context);
  const selected = requestedSlotIds.flatMap((id) => {
    const slot = available.slots.find((candidate) => candidate.slotId === id);
    return slot ? [slot] : [];
  });
  if (selected.length !== requestedSlotIds.length) {
    throw new MeetingInvitationHttpError(
      409,
      "선택한 시간 중 하나가 방금 불가능해졌어요. 최신 가능 시간을 확인하고 다시 선택해 주세요."
    );
  }
  const selectionTimezoneAtRead = available.timezone;
  let selection = await selectMeetingOption({
    additionalMessage: isRecord(context.additionalMessage)
      ? clean(context.additionalMessage.sourceText, 2_000) || null
      : null,
    candidateName: context.invitationSnapshot.candidate.name,
    options: selected,
    timezone: selectionTimezoneAtRead,
  });

  context = await loadInvitationContext(token);
  available = await availablePublicSlots(token, context);
  const finalOptions = requestedSlotIds.flatMap((id) => {
    const slot = available.slots.find((candidate) => candidate.slotId === id);
    return slot ? [slot] : [];
  });
  if (finalOptions.length === 0) {
    throw new MeetingInvitationHttpError(
      409,
      "선택한 시간이 방금 불가능해졌어요. 최신 가능 시간을 확인하고 다시 선택해 주세요."
    );
  }
  if (
    available.timezone !== selectionTimezoneAtRead ||
    !finalOptions.some((option) => option.slotId === selection.chosenSlotId)
  ) {
    selection = selectMeetingOptionDeterministically({
      candidateName: context.invitationSnapshot.candidate.name,
      reportedOptions: selected,
      timezone: available.timezone,
      validOptions: finalOptions,
    });
  }
  const chosen = finalOptions.find(
    (option) => option.slotId === selection.chosenSlotId
  );
  if (!chosen || available.availabilityVersion < 1) {
    throw new MeetingInvitationHttpError(
      409,
      "선택한 시간이 방금 불가능해졌어요. 최신 가능 시간을 확인하고 다시 선택해 주세요."
    );
  }

  const selectionSnapshot = {
    chosenEndAt: chosen.endAt,
    chosenSlotId: chosen.slotId,
    chosenStartAt: chosen.startAt,
    companyMessage: selection.companyMessage,
    method: selection.method,
    model: selection.model,
    selectedAt: new Date().toISOString(),
    timezone: available.timezone,
  };
  const admin = getSupabaseAdmin();
  const { error } = await (admin.rpc as any)(
    "submit_meeting_schedule_options_v1",
    {
      p_candidate_options: selected as unknown as Json,
      p_confirmed_end_at: chosen.endAt,
      p_confirmed_start_at: chosen.startAt,
      p_expected_availability_version: available.availabilityVersion,
      p_public_token_hash: tokenHash(token),
      p_selection_snapshot: selectionSnapshot as unknown as Json,
    }
  );
  if (error?.code === "40001") {
    throw new MeetingInvitationHttpError(
      409,
      "선택한 시간 중 하나가 방금 불가능해졌어요. 최신 가능 시간을 확인하고 다시 선택해 주세요."
    );
  }
  if (error?.code === "55000") {
    throw new MeetingInvitationHttpError(
      409,
      "이미 제출한 일정은 수정할 수 없어요."
    );
  }
  if (error) throw error;
  try {
    await notifyCompanyOfMeetingConfirmation({
      companyMessage: selection.companyMessage,
      roundId: context.roundId,
      sourceCompanyMessageId: context.sourceCompanyMessageId,
      workspaceId: context.workspaceId,
    });
  } catch (notificationError) {
    console.error("[meeting-schedule/company-confirmation]", notificationError);
  }
  return {
    confirmedAt: chosen.startAt,
    durationMinutes: context.invitationSnapshot.durationMinutes,
    ok: true,
    timezone: available.timezone,
  };
}

export { INVITATION_QUEUE_TYPE };
