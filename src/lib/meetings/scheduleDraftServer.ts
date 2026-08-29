import type { User } from "@supabase/supabase-js";
import type { OrgAgentAdminClient } from "@/lib/org/agent/data";
import {
  fetchMeetingAvailability,
  fetchMeetingAvailabilityForCompanyUser,
} from "@/lib/meetings/availabilityServer";
import {
  buildDefaultInterviewTitle,
  DEFAULT_MEETING_OFFER_WINDOW_DAYS,
  DEFAULT_MEETING_PROVIDER,
  type MeetingScheduleDetailResponse,
  type MeetingScheduleListResponse,
  type MeetingScheduleAdditionalMessage,
  type MeetingScheduleAttendee,
  type MeetingScheduleInvitationKind,
  type MeetingScheduleStageProfile,
  normalizeInterviewDuration,
  resolveMeetingOrganizerEmail,
  resolveMeetingOrganizerName,
  type PreparedMeetingScheduleDraft,
} from "@/lib/meetings/scheduleDraft";
import { fetchMeetingCalendarDelivery } from "@/lib/meetings/meetingCalendarServer";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Json } from "@/types/database.types";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function uniqueEmails(values: string[]) {
  return Array.from(new Set(values.map(cleanEmail).filter(Boolean)));
}

function normalizeDurationOrThrow(value: unknown) {
  try {
    return normalizeInterviewDuration(value);
  } catch (error) {
    throw new OrgHttpError(
      400,
      error instanceof Error ? error.message : "미팅 시간을 확인해 주세요."
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeAdditionalMessage(args: {
  sourceText?: unknown;
  visibility?: unknown;
}): MeetingScheduleAdditionalMessage | null {
  const sourceText = clean(args.sourceText).slice(0, 2_000);
  if (!sourceText) return null;
  const visibility = clean(args.visibility);
  if (!["both", "candidate", "internal"].includes(visibility)) {
    throw new OrgHttpError(400, "추가 메시지의 공개 범위를 확인해 주세요.");
  }
  return {
    sourceText,
    visibility: visibility as MeetingScheduleAdditionalMessage["visibility"],
  };
}

function normalizeMeetingPurpose(value: unknown) {
  return clean(value).slice(0, 600);
}

function hasProvidedValue(value: unknown) {
  return value !== undefined;
}

function combineCandidateMessages(
  defaultMessage: string | null,
  additionalMessage: MeetingScheduleAdditionalMessage | null
) {
  if (!defaultMessage) return additionalMessage;
  if (!additionalMessage) {
    return { sourceText: defaultMessage, visibility: "candidate" as const };
  }
  // A single round message has one visibility. Keep a saved candidate-facing
  // process-stage note rather than combining it with a one-off internal instruction,
  // which could otherwise expose the internal instruction in the invitation.
  if (additionalMessage.visibility === "internal") {
    return { sourceText: defaultMessage, visibility: "candidate" as const };
  }
  if (
    additionalMessage.sourceText === defaultMessage ||
    additionalMessage.sourceText
      .split("\n")
      .map((value) => value.trim())
      .includes(defaultMessage)
  ) {
    return additionalMessage;
  }
  return {
    sourceText: [defaultMessage, additionalMessage.sourceText]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2_000),
    visibility: additionalMessage.visibility,
  };
}

async function fetchStageMeetingDefaults(args: {
  admin: OrgAgentAdminClient;
  roleId: string;
  stageId: string;
}) {
  const { data, error } = await (
    args.admin.from("ops_matching_role_stages" as any) as any
  )
    .select(
      "id, label, meeting_purpose, meeting_duration_minutes, meeting_candidate_message"
    )
    .eq("role_id", args.roleId)
    .eq("id", args.stageId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const meetingPurpose = normalizeMeetingPurpose(data.meeting_purpose);
  const durationMinutes = Number(data.meeting_duration_minutes);
  if (!meetingPurpose || !Number.isSafeInteger(durationMinutes)) return null;
  return {
    candidateMessage:
      clean(data.meeting_candidate_message).slice(0, 2_000) || null,
    durationMinutes: normalizeDurationOrThrow(durationMinutes),
    meetingPurpose,
    stageId: clean(data.id),
    stageName: clean(data.label) || "다음 단계",
  };
}

export async function saveStageMeetingDefaults(args: {
  admin: OrgAgentAdminClient;
  meetingStage: MeetingScheduleStageProfile;
  roleId: string;
}) {
  const { error } = await (
    args.admin.from("ops_matching_role_stages" as any) as any
  )
    .update({
      meeting_candidate_message: args.meetingStage.candidateMessage,
      meeting_duration_minutes: args.meetingStage.durationMinutes,
      meeting_purpose: args.meetingStage.meetingPurpose,
    })
    .eq("id", args.meetingStage.stageId)
    .eq("role_id", args.roleId);
  if (error) throw error;
}

async function resolveWorkspaceAttendees(args: {
  actorLabel: string;
  admin: OrgAgentAdminClient;
  attendeeEmails: string[];
  organizerCompanyUserId?: string;
  user: User;
  workspaceId: string;
}) {
  const { data: membershipData, error: membershipError } = await (
    args.admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id")
    .eq("company_workspace_id", args.workspaceId);
  if (membershipError) throw membershipError;
  const memberIds = Array.from(
    new Set(
      (membershipData ?? []).map((row: any) => clean(row.company_user_id))
    )
  ).filter(Boolean);

  const { data: memberData, error: memberError } = await (
    args.admin.from("company_users" as any) as any
  )
    .select("user_id, name, email")
    .in("user_id", memberIds.length > 0 ? memberIds : [args.user.id]);
  if (memberError) throw memberError;

  const members = (memberData ?? []).map((row: any) => ({
    companyUserId: clean(row.user_id),
    email: cleanEmail(row.email),
    name: clean(row.name),
  })) as MeetingScheduleAttendee[];
  const requesterEmail = cleanEmail(args.user.email);
  const organizerCompanyUserId =
    clean(args.organizerCompanyUserId) || args.user.id;
  const organizer = members.find(
    (member) => member.companyUserId === organizerCompanyUserId
  ) ?? {
    companyUserId: organizerCompanyUserId,
    email: organizerCompanyUserId === args.user.id ? requesterEmail : "",
    name: clean(args.actorLabel) || "현재 사용자",
  };
  organizer.name = resolveMeetingOrganizerName({
    actorLabel: args.actorLabel,
    organizerCompanyUserId,
    requesterUserId: args.user.id,
    storedName: organizer.name,
  });
  organizer.email = resolveMeetingOrganizerEmail({
    organizerCompanyUserId,
    requesterEmail,
    requesterUserId: args.user.id,
    storedEmail: organizer.email,
  });

  const requestedEmails = uniqueEmails(args.attendeeEmails);
  const missingEmails = requestedEmails.filter(
    (email) => !members.some((member) => member.email === email)
  );
  if (missingEmails.length > 0) {
    throw new OrgHttpError(
      400,
      `Workspace 멤버에서 참석자를 찾지 못했어요: ${missingEmails.join(", ")}`
    );
  }

  const attendees = [
    organizer,
    ...requestedEmails.flatMap((email) => {
      const member = members.find((candidate) => candidate.email === email);
      return member ? [member] : [];
    }),
  ].filter(
    (attendee, index, all) =>
      all.findIndex(
        (candidate) => candidate.companyUserId === attendee.companyUserId
      ) === index
  );

  return { attendees, organizer };
}

export async function prepareMeetingScheduleDraft(args: {
  actorLabel: string;
  additionalMessage?: unknown;
  additionalMessageVisibility?: unknown;
  admin: OrgAgentAdminClient;
  attendeeEmails?: string[];
  candidateName: string;
  companyName: string;
  durationMinutes?: unknown;
  invitationKind?: MeetingScheduleInvitationKind;
  meetingStage?: MeetingScheduleStageProfile | null;
  meetingStageRequired?: boolean;
  meetingPurpose?: unknown;
  processStageId?: string | null;
  processStageName?: string | null;
  title?: unknown;
  user: User;
  workspaceId: string;
}): Promise<PreparedMeetingScheduleDraft> {
  const { attendees, organizer } = await resolveWorkspaceAttendees({
    actorLabel: args.actorLabel,
    admin: args.admin,
    attendeeEmails: args.attendeeEmails ?? [],
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const availabilityResult = await fetchMeetingAvailability({
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const explicitTitle = clean(args.title);
  const durationMinutes = normalizeDurationOrThrow(args.durationMinutes);
  const meetingPurpose = normalizeMeetingPurpose(args.meetingPurpose);
  const availability = availabilityResult.availability;
  return {
    additionalMessage: combineCandidateMessages(
      args.meetingStage?.candidateMessage ?? null,
      normalizeAdditionalMessage({
        sourceText: args.additionalMessage,
        visibility: args.additionalMessageVisibility ?? "both",
      })
    ),
    availability,
    config: {
      companyAttendees: attendees,
      conferenceProvider: DEFAULT_MEETING_PROVIDER,
      durationMinutes,
      invitationKind: args.invitationKind ?? "process_stage",
      meetingPurpose,
      offerWindowDays: DEFAULT_MEETING_OFFER_WINDOW_DAYS,
      organizer,
      processStageId: clean(args.processStageId) || null,
      processStageName: clean(args.processStageName) || null,
      title:
        explicitTitle.slice(0, 200) ||
        buildDefaultInterviewTitle({
          candidateName: args.candidateName,
          companyName: args.companyName,
        }),
    },
    draftBlocker:
      args.meetingStageRequired || !meetingPurpose
        ? "meeting_stage_missing"
        : !organizer.email
          ? "organizer_email_missing"
          : availability
            ? null
            : "availability_missing",
    meetingStage: args.meetingStage ?? null,
  };
}

export async function createMeetingScheduleDraft(args: {
  admin: OrgAgentAdminClient;
  draft: PreparedMeetingScheduleDraft;
  recommendationId: string;
  roleId: string;
  sourceCompanyMessageId: number | null;
  talentId: string;
  workspaceId: string;
}) {
  if (args.draft.draftBlocker) {
    throw new OrgHttpError(
      400,
      args.draft.draftBlocker === "organizer_email_missing"
        ? "미팅에 참석할 회사 사용자의 이메일을 확인해 주세요. 후보자에게는 아직 연락하지 않았어요."
        : args.draft.draftBlocker === "meeting_stage_missing"
          ? "이 단계에서 나눌 주제와 시간을 먼저 알려주세요. 후보자에게는 아직 연락하지 않았어요."
          : "먼저 미팅 가능한 시간을 알려주세요. 후보자에게는 아직 연락하지 않았어요."
    );
  }
  const { config } = args.draft;
  const idempotencyKey = [
    "stage_schedule",
    args.workspaceId,
    args.recommendationId,
    config.processStageId ?? "legacy_connection",
  ].join(":");
  const { data, error } = await (args.admin.rpc as any)(
    "create_meeting_schedule_draft_v1",
    {
      p_additional_message: args.draft.additionalMessage as Json | null,
      p_company_attendees: config.companyAttendees as unknown as Json,
      p_company_workspace_id: args.workspaceId,
      p_draft_blocker: args.draft.draftBlocker,
      p_duration_minutes: config.durationMinutes,
      p_idempotency_key: idempotencyKey,
      p_meeting_config_snapshot: config as unknown as Json,
      p_organizer_company_user_id: config.organizer.companyUserId,
      p_recommendation_id: args.recommendationId,
      p_role_id: args.roleId,
      p_source_company_message_id: args.sourceCompanyMessageId,
      p_talent_id: args.talentId,
      p_title: config.title,
    }
  );
  if (error) throw error;
  const result = data as Record<string, unknown> | null;
  const scheduleId = clean(result?.scheduleId);
  const roundId = clean(result?.roundId);
  if (!scheduleId || !roundId) {
    throw new OrgHttpError(500, "미팅 정보를 저장하지 못했어요.");
  }
  return {
    alreadyExisted: result?.alreadyExisted === true,
    roundId,
    scheduleId,
    status: clean(result?.status) || "preparing",
  };
}

export async function prepareMeetingScheduleDraftForStage(args: {
  additionalMessage?: unknown;
  additionalMessageVisibility?: unknown;
  attendeeEmails?: string[];
  durationMinutes?: unknown;
  invitationKind?: MeetingScheduleInvitationKind;
  meetingCandidateMessage?: unknown;
  meetingPurpose?: unknown;
  recommendationId: string;
  roleId: string;
  sourceStage?: string | null;
  stageId: string;
  talentId: string;
  title?: unknown;
  user: User;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = clean(args.workspaceId);
  const roleId = clean(args.roleId);
  const stageId = clean(args.stageId);
  const talentId = clean(args.talentId);
  const recommendationId = clean(args.recommendationId);
  if (!workspaceId || !roleId || !stageId || !talentId || !recommendationId) {
    throw new OrgHttpError(400, "일정 요청 대상을 확인해 주세요.");
  }

  await assertOrgWorkspacePermission({
    admin,
    permission: "manage_candidates",
    user: args.user,
    workspaceId,
  });

  const [
    workspaceResult,
    roleResult,
    recommendationResult,
    candidateResult,
    stageResult,
  ] = await Promise.all([
    (admin.from("company_workspace" as any) as any)
      .select("company_workspace_id, company_name")
      .eq("company_workspace_id", workspaceId)
      .maybeSingle(),
    (admin.from("company_roles" as any) as any)
      .select("role_id, company_workspace_id")
      .eq("role_id", roleId)
      .eq("company_workspace_id", workspaceId)
      .maybeSingle(),
    (admin.from("talent_opportunity_recommendation" as any) as any)
      .select("id")
      .eq("id", recommendationId)
      .eq("role_id", roleId)
      .eq("talent_id", talentId)
      .maybeSingle(),
    (admin.from("talent_users" as any) as any)
      .select("user_id, name")
      .eq("user_id", talentId)
      .maybeSingle(),
    (admin.from("ops_matching_role_stages" as any) as any)
      .select(
        "id, label, meeting_purpose, meeting_duration_minutes, meeting_candidate_message"
      )
      .eq("id", stageId)
      .eq("role_id", roleId)
      .maybeSingle(),
  ]);
  for (const result of [
    workspaceResult,
    roleResult,
    recommendationResult,
    candidateResult,
    stageResult,
  ]) {
    if (result.error) throw result.error;
  }
  if (!workspaceResult.data)
    throw new OrgHttpError(404, "Workspace를 찾지 못했어요.");
  if (!roleResult.data) throw new OrgHttpError(404, "Role을 찾지 못했어요.");
  if (!recommendationResult.data) {
    throw new OrgHttpError(404, "후보자 추천 정보를 찾지 못했어요.");
  }
  if (!candidateResult.data) {
    throw new OrgHttpError(404, "후보자를 찾지 못했어요.");
  }
  if (!stageResult.data) {
    throw new OrgHttpError(
      400,
      "일정을 잡을 프로세스 단계를 먼저 선택해 주세요."
    );
  }

  const storedStage = await fetchStageMeetingDefaults({
    admin,
    roleId,
    stageId,
  });
  const suppliedPurpose = normalizeMeetingPurpose(args.meetingPurpose);
  const stageCandidateMessageProvided = hasProvidedValue(
    args.meetingCandidateMessage
  );
  const suppliedCandidateMessage = stageCandidateMessageProvided
    ? clean(args.meetingCandidateMessage).slice(0, 2_000) || null
    : null;
  const hasDurationOverride = hasProvidedValue(args.durationMinutes);
  const needsMeetingStage =
    !storedStage && (!suppliedPurpose || !hasDurationOverride);
  const meetingStage = needsMeetingStage
    ? null
    : {
        candidateMessage: stageCandidateMessageProvided
          ? suppliedCandidateMessage
          : storedStage?.candidateMessage ||
            clean(stageResult.data.meeting_candidate_message).slice(0, 2_000) ||
            null,
        durationMinutes: hasDurationOverride
          ? normalizeDurationOrThrow(args.durationMinutes)
          : (storedStage?.durationMinutes ??
            normalizeDurationOrThrow(args.durationMinutes)),
        meetingPurpose: suppliedPurpose || storedStage?.meetingPurpose || "",
        source:
          storedStage &&
          !suppliedPurpose &&
          !hasDurationOverride &&
          !stageCandidateMessageProvided
            ? ("stage_default" as const)
            : ("new" as const),
        stageId,
        stageName: clean(stageResult.data.label) || "다음 단계",
      };
  if (meetingStage?.source === "new") {
    await saveStageMeetingDefaults({ admin, meetingStage, roleId });
  }

  const draft = await prepareMeetingScheduleDraft({
    actorLabel:
      clean(args.user.user_metadata?.name) ||
      clean(args.user.user_metadata?.full_name) ||
      clean(args.user.email).split("@")[0] ||
      "현재 사용자",
    additionalMessage: args.additionalMessage,
    additionalMessageVisibility: args.additionalMessageVisibility ?? "both",
    admin,
    attendeeEmails: args.attendeeEmails,
    candidateName: clean(candidateResult.data.name) || "Candidate",
    companyName: clean(workspaceResult.data.company_name) || "Company",
    durationMinutes: meetingStage?.durationMinutes ?? args.durationMinutes,
    invitationKind:
      args.invitationKind ??
      (clean(args.sourceStage) === "pending_connection"
        ? "first_company_conversation"
        : "process_stage"),
    meetingStage,
    meetingStageRequired: needsMeetingStage,
    meetingPurpose: meetingStage?.meetingPurpose,
    processStageId: stageId,
    processStageName: meetingStage?.stageName ?? clean(stageResult.data.label),
    title: args.title,
    user: args.user,
    workspaceId,
  });

  return {
    admin,
    draft,
    recommendationId,
    roleId,
    talentId,
    workspaceId,
  };
}

function parseStoredAttendees(value: unknown): MeetingScheduleAttendee[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const companyUserId = clean(item.companyUserId);
    if (!companyUserId) return [];
    return [
      {
        companyUserId,
        email: cleanEmail(item.email),
        name:
          clean(item.name) || cleanEmail(item.email).split("@")[0] || "참석자",
      },
    ];
  });
}

function parseStoredAdditionalMessage(
  value: unknown
): MeetingScheduleAdditionalMessage | null {
  if (!isRecord(value)) return null;
  const sourceText = clean(value.sourceText);
  const visibility = clean(value.visibility);
  if (!sourceText || !["both", "candidate", "internal"].includes(visibility)) {
    return null;
  }
  return {
    sourceText,
    visibility: visibility as MeetingScheduleAdditionalMessage["visibility"],
  };
}

function parseCandidateOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const dateKey = clean(item.dateKey);
    const startAt = clean(item.startAt);
    const endAt = clean(item.endAt);
    return dateKey && startAt && endAt ? [{ dateKey, endAt, startAt }] : [];
  });
}

function parseSelection(value: unknown) {
  if (!isRecord(value)) return null;
  const companyMessage = clean(value.companyMessage);
  const method = clean(value.method);
  const selectedAt = clean(value.selectedAt);
  const timezone = clean(value.timezone) || null;
  return companyMessage && selectedAt
    ? { companyMessage, method, selectedAt, timezone }
    : null;
}

export async function fetchMeetingScheduleDetail(args: {
  scheduleId: string;
  user: User;
  workspaceId: string;
}): Promise<MeetingScheduleDetailResponse> {
  const admin = getSupabaseAdmin();
  const scheduleId = clean(args.scheduleId);
  const workspaceId = clean(args.workspaceId);
  if (!scheduleId || !workspaceId) {
    throw new OrgHttpError(400, "일정 요청을 확인해 주세요.");
  }
  await assertOrgWorkspacePermission({
    admin,
    permission: "view",
    user: args.user,
    workspaceId,
  });

  const { data: schedule, error: scheduleError } = await (
    admin.from("meeting_schedules" as any) as any
  )
    .select(
      "id, company_workspace_id, role_id, recommendation_id, talent_id, organizer_company_user_id, status, title, duration_minutes, company_attendees, active_round_id, confirmed_start_at, confirmed_end_at, version, updated_at"
    )
    .eq("id", scheduleId)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!schedule) throw new OrgHttpError(404, "일정 요청을 찾지 못했어요.");
  if (!schedule.active_round_id) {
    throw new OrgHttpError(409, "현재 일정 요청 내용을 찾지 못했어요.");
  }

  const [
    roundResult,
    roleResult,
    candidateResult,
    workspaceResult,
    availability,
    calendar,
  ] = await Promise.all([
    (admin.from("meeting_schedule_rounds" as any) as any)
      .select(
        "id, schedule_id, round_number, status, meeting_config_snapshot, additional_message, invitation_expires_at, invitation_snapshot, candidate_options, selection_snapshot, submitted_at, delivery_queue_id"
      )
      .eq("id", schedule.active_round_id)
      .eq("schedule_id", schedule.id)
      .maybeSingle(),
    (admin.from("company_roles" as any) as any)
      .select("role_id, name")
      .eq("role_id", schedule.role_id)
      .maybeSingle(),
    (admin.from("talent_users" as any) as any)
      .select("user_id, name, email")
      .eq("user_id", schedule.talent_id)
      .maybeSingle(),
    (admin.from("company_workspace" as any) as any)
      .select("company_workspace_id, company_name")
      .eq("company_workspace_id", workspaceId)
      .maybeSingle(),
    fetchMeetingAvailabilityForCompanyUser({
      admin,
      companyUserId: schedule.organizer_company_user_id,
      workspaceId,
    }),
    fetchMeetingCalendarDelivery({ admin, scheduleId: schedule.id }),
  ]);
  for (const result of [
    roundResult,
    roleResult,
    candidateResult,
    workspaceResult,
  ]) {
    if (result.error) throw result.error;
  }
  if (!roundResult.data || !roleResult.data || !candidateResult.data) {
    throw new OrgHttpError(409, "일정 요청의 연결 정보를 확인하지 못했어요.");
  }

  const deliveryQueueId = clean(roundResult.data.delivery_queue_id);
  const deliveryResult = deliveryQueueId
    ? await (admin.from("contact_queue" as any) as any)
        .select("id, status, scheduled_at, sent_at, last_error")
        .eq("id", deliveryQueueId)
        .maybeSingle()
    : { data: null, error: null };
  if (deliveryResult.error) throw deliveryResult.error;

  const attendees = parseStoredAttendees(schedule.company_attendees);
  const snapshot = isRecord(roundResult.data.meeting_config_snapshot)
    ? roundResult.data.meeting_config_snapshot
    : {};
  const snapshotOrganizer = isRecord(snapshot.organizer)
    ? snapshot.organizer
    : null;
  const organizer = attendees.find(
    (attendee) => attendee.companyUserId === schedule.organizer_company_user_id
  ) ?? {
    companyUserId: schedule.organizer_company_user_id,
    email: cleanEmail(snapshotOrganizer?.email),
    name: clean(snapshotOrganizer?.name) || "일정 담당자",
  };

  const selection = parseSelection(roundResult.data.selection_snapshot);
  return {
    ok: true,
    schedule: {
      availability,
      calendar,
      candidate: {
        email: cleanEmail(candidateResult.data.email) || null,
        name: clean(candidateResult.data.name) || "이름 없는 후보자",
        talentId: schedule.talent_id,
      },
      companyName: clean(workspaceResult.data?.company_name) || "Company",
      confirmedEndAt: clean(schedule.confirmed_end_at) || null,
      confirmedStartAt: clean(schedule.confirmed_start_at) || null,
      config: {
        companyAttendees: attendees.length > 0 ? attendees : [organizer],
        conferenceProvider: DEFAULT_MEETING_PROVIDER,
        durationMinutes: Number(schedule.duration_minutes),
        invitationKind:
          clean(snapshot.invitationKind) === "process_stage"
            ? "process_stage"
            : "first_company_conversation",
        meetingPurpose:
          normalizeMeetingPurpose(snapshot.meetingPurpose) || "첫 대화",
        offerWindowDays:
          Number(snapshot.offerWindowDays) || DEFAULT_MEETING_OFFER_WINDOW_DAYS,
        organizer,
        processStageId: clean(snapshot.processStageId) || null,
        processStageName: clean(snapshot.processStageName) || null,
        title: clean(schedule.title),
      },
      recommendationId: schedule.recommendation_id,
      role: {
        name: clean(roleResult.data.name) || "이름 없는 역할",
        roleId: schedule.role_id,
      },
      round: {
        additionalMessage: parseStoredAdditionalMessage(
          roundResult.data.additional_message
        ),
        candidateOptions: parseCandidateOptions(
          roundResult.data.candidate_options
        ),
        delivery: deliveryResult.data
          ? {
              error: clean(deliveryResult.data.last_error) || null,
              scheduledAt: clean(deliveryResult.data.scheduled_at) || null,
              sentAt: clean(deliveryResult.data.sent_at) || null,
              status: clean(deliveryResult.data.status),
            }
          : null,
        expiresAt: clean(roundResult.data.invitation_expires_at) || null,
        id: roundResult.data.id,
        roundNumber: Number(roundResult.data.round_number),
        selection,
        status: clean(roundResult.data.status),
        submittedAt: clean(roundResult.data.submitted_at) || null,
        timezone:
          selection?.timezone ??
          (isRecord(roundResult.data.invitation_snapshot)
            ? clean(roundResult.data.invitation_snapshot.timezone) || null
            : null),
      },
      scheduleId: schedule.id,
      status: clean(schedule.status),
      updatedAt: clean(schedule.updated_at),
      version: Number(schedule.version),
      workspaceId,
    },
  };
}

export async function fetchMeetingScheduleList(args: {
  user: User;
  workspaceId: string;
}): Promise<MeetingScheduleListResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = clean(args.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  await assertOrgWorkspacePermission({
    admin,
    permission: "view",
    user: args.user,
    workspaceId,
  });
  const { data, error } = await (admin.from("meeting_schedules" as any) as any)
    .select(
      "id, role_id, talent_id, status, title, active_round_id, updated_at"
    )
    .eq("company_workspace_id", workspaceId)
    .in("status", ["preparing", "awaiting_talent", "confirmed"])
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const schedules = (data ?? []) as Array<{
    active_round_id: string | null;
    id: string;
    role_id: string;
    status: string;
    talent_id: string;
    title: string;
    updated_at: string;
  }>;
  if (schedules.length === 0) return { items: [], ok: true, workspaceId };
  const roleIds = Array.from(new Set(schedules.map((item) => item.role_id)));
  const talentIds = Array.from(
    new Set(schedules.map((item) => item.talent_id))
  );
  const roundIds = schedules.flatMap((item) =>
    item.active_round_id ? [item.active_round_id] : []
  );
  const [rolesResult, talentsResult, roundsResult] = await Promise.all([
    (admin.from("company_roles" as any) as any)
      .select("role_id, name")
      .in("role_id", roleIds),
    (admin.from("talent_users" as any) as any)
      .select("user_id, name, email")
      .in("user_id", talentIds),
    roundIds.length > 0
      ? (admin.from("meeting_schedule_rounds" as any) as any)
          .select("id, status")
          .in("id", roundIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [rolesResult, talentsResult, roundsResult]) {
    if (result.error) throw result.error;
  }
  const roleNames = new Map<string, string>(
    (rolesResult.data ?? []).map((row: any): [string, string] => [
      clean(row.role_id),
      clean(row.name),
    ])
  );
  const candidateNames = new Map<string, string>(
    (talentsResult.data ?? []).map((row: any): [string, string] => [
      clean(row.user_id),
      clean(row.name) || cleanEmail(row.email) || "이름 없는 후보자",
    ])
  );
  const roundStatuses = new Map<string, string>(
    (roundsResult.data ?? []).map((row: any): [string, string] => [
      clean(row.id),
      clean(row.status),
    ])
  );
  return {
    items: schedules.map((schedule) => ({
      candidateName:
        candidateNames.get(schedule.talent_id) || "이름 없는 후보자",
      roleName: roleNames.get(schedule.role_id) || "이름 없는 역할",
      roundStatus: schedule.active_round_id
        ? roundStatuses.get(schedule.active_round_id) || "draft"
        : "draft",
      scheduleId: schedule.id,
      status: clean(schedule.status),
      title: clean(schedule.title),
      updatedAt: clean(schedule.updated_at),
    })),
    ok: true,
    workspaceId,
  };
}

export async function updateMeetingScheduleDraft(args: {
  additionalMessage?: unknown;
  additionalMessageVisibility?: unknown;
  attendeeEmails?: string[];
  durationMinutes?: unknown;
  expectedVersion: unknown;
  scheduleId: string;
  title?: unknown;
  user: User;
  workspaceId: string;
}): Promise<MeetingScheduleDetailResponse> {
  const admin = getSupabaseAdmin();
  const scheduleId = clean(args.scheduleId);
  const workspaceId = clean(args.workspaceId);
  const expectedVersion = Number(args.expectedVersion);
  if (
    !scheduleId ||
    !workspaceId ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw new OrgHttpError(400, "저장할 일정 초안의 버전을 확인해 주세요.");
  }
  await assertOrgWorkspacePermission({
    admin,
    permission: "manage_candidates",
    user: args.user,
    workspaceId,
  });

  const { data: schedule, error: scheduleError } = await (
    admin.from("meeting_schedules" as any) as any
  )
    .select(
      "id, organizer_company_user_id, company_attendees, status, active_round_id"
    )
    .eq("id", scheduleId)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!schedule) throw new OrgHttpError(404, "일정 요청을 찾지 못했어요.");
  if (schedule.status !== "preparing") {
    throw new OrgHttpError(
      409,
      "이미 후보자 요청 단계로 넘어간 일정은 이 화면에서 수정할 수 없어요."
    );
  }

  const roundResult = schedule.active_round_id
    ? await (admin.from("meeting_schedule_rounds" as any) as any)
        .select("meeting_config_snapshot")
        .eq("id", schedule.active_round_id)
        .eq("schedule_id", schedule.id)
        .maybeSingle()
    : { data: null, error: null };
  if (roundResult.error) throw roundResult.error;
  const existingSnapshot = isRecord(roundResult.data?.meeting_config_snapshot)
    ? roundResult.data.meeting_config_snapshot
    : {};

  const storedOrganizer = parseStoredAttendees(schedule.company_attendees).find(
    (attendee) => attendee.companyUserId === schedule.organizer_company_user_id
  );

  const { attendees, organizer } = await resolveWorkspaceAttendees({
    actorLabel:
      storedOrganizer?.name ||
      clean(args.user.user_metadata?.name) ||
      clean(args.user.user_metadata?.full_name) ||
      clean(args.user.email).split("@")[0] ||
      "일정 담당자",
    admin,
    attendeeEmails: args.attendeeEmails ?? [],
    organizerCompanyUserId: schedule.organizer_company_user_id,
    user: args.user,
    workspaceId,
  });
  if (!organizer.email) {
    throw new OrgHttpError(
      400,
      "일정 담당자의 회사 이메일을 확인한 뒤 다시 저장해 주세요."
    );
  }
  const title = clean(args.title).slice(0, 200);
  if (!title) throw new OrgHttpError(400, "인터뷰 제목을 입력해 주세요.");
  const durationMinutes = normalizeDurationOrThrow(args.durationMinutes);
  const additionalMessage = normalizeAdditionalMessage({
    sourceText: args.additionalMessage,
    visibility: args.additionalMessageVisibility ?? "both",
  });
  const config = {
    companyAttendees: attendees,
    conferenceProvider: DEFAULT_MEETING_PROVIDER,
    durationMinutes,
    invitationKind:
      clean(existingSnapshot.invitationKind) === "process_stage"
        ? "process_stage"
        : "first_company_conversation",
    meetingPurpose:
      normalizeMeetingPurpose(existingSnapshot.meetingPurpose) || "첫 대화",
    offerWindowDays: DEFAULT_MEETING_OFFER_WINDOW_DAYS,
    organizer,
    processStageId: clean(existingSnapshot.processStageId) || null,
    processStageName: clean(existingSnapshot.processStageName) || null,
    title,
  };
  const { error } = await (admin.rpc as any)(
    "update_meeting_schedule_draft_v1",
    {
      p_additional_message: additionalMessage as Json | null,
      p_company_attendees: attendees as unknown as Json,
      p_company_workspace_id: workspaceId,
      p_duration_minutes: durationMinutes,
      p_expected_version: expectedVersion,
      p_meeting_config_snapshot: config as unknown as Json,
      p_schedule_id: scheduleId,
      p_title: title,
    }
  );
  if (error?.code === "40001") {
    throw new OrgHttpError(
      409,
      "다른 화면에서 일정 초안이 바뀌었어요. 최신 내용을 다시 불러와 주세요."
    );
  }
  if (error?.code === "55000") {
    throw new OrgHttpError(
      409,
      "이미 다음 단계로 넘어간 일정은 이 화면에서 수정할 수 없어요."
    );
  }
  if (error) throw error;
  return fetchMeetingScheduleDetail({
    scheduleId,
    user: args.user,
    workspaceId,
  });
}
