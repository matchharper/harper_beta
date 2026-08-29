import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  createComposioClient,
  getIntegrationErrorDiagnostics,
  readComposioEnv,
} from "@/lib/integrations/composio";
import { createGoogleCalendarService } from "@/lib/integrations/googleCalendar";
import { GoogleCalendarError } from "@/lib/integrations/googleCalendarError";
import { createGoogleCalendarStore } from "@/lib/integrations/googleCalendarStore";
import {
  buildGoogleCalendarCreateEventArguments,
  buildGoogleCalendarEventLookupArguments,
  GOOGLE_CALENDAR_CREATE_EVENT_TOOL,
  GOOGLE_CALENDAR_LIST_EVENTS_TOOL,
  GOOGLE_CALENDAR_TOOL_VERSION,
  isValidCalendarTimezone,
  parseCreatedGoogleCalendarEvent,
  parseExistingGoogleCalendarEvent,
  type GoogleCalendarEventResult,
} from "@/lib/integrations/googleCalendarTools";
import type {
  MeetingCalendarDelivery,
  MeetingCalendarDeliveryStatus,
  MeetingCalendarRetryResponse,
} from "@/lib/meetings/meetingCalendar";
import { buildMeetingCalendarAttendeeEmails } from "@/lib/meetings/meetingCalendar";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

function clean(value: unknown, maxLength = 10_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validEmail(value: unknown) {
  const email = clean(value, 320).toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function parseTimezone(round: Record<string, unknown>) {
  const selection = isRecord(round.selection_snapshot)
    ? round.selection_snapshot
    : null;
  const invitation = isRecord(round.invitation_snapshot)
    ? round.invitation_snapshot
    : null;
  const timezone =
    clean(selection?.timezone, 128) || clean(invitation?.timezone, 128);
  return isValidCalendarTimezone(timezone) ? timezone : "Asia/Seoul";
}

function deliveryStatus(value: unknown): MeetingCalendarDeliveryStatus {
  const status = clean(value, 80) as MeetingCalendarDeliveryStatus;
  return new Set<MeetingCalendarDeliveryStatus>([
    "pending",
    "creating",
    "created",
    "created_without_meet",
    "failed",
  ]).has(status)
    ? status
    : "failed";
}

function toDelivery(row: Record<string, unknown>): MeetingCalendarDelivery {
  return {
    calendarUrl: clean(row.calendar_url, 2_048) || null,
    error: clean(row.last_error, 1_000) || null,
    meetUrl: clean(row.conference_url, 2_048) || null,
    status: deliveryStatus(row.status),
    updatedAt: clean(row.updated_at, 80),
  };
}

export async function fetchMeetingCalendarDelivery(args: {
  admin?: AdminClient;
  scheduleId: string;
}) {
  const admin = args.admin ?? getSupabaseAdmin();
  const { data, error } = await (
    admin.from("meeting_schedule_calendar_events" as any) as any
  )
    .select("status, calendar_url, conference_url, last_error, updated_at")
    .eq("schedule_id", args.scheduleId)
    .maybeSingle();
  if (error) throw error;
  return data ? toDelivery(data) : null;
}

async function updateDelivery(args: {
  admin: AdminClient;
  calendar?: GoogleCalendarEventResult;
  error?: string;
  scheduleId: string;
  status: MeetingCalendarDeliveryStatus;
}) {
  const { data, error } = await (
    args.admin.from("meeting_schedule_calendar_events" as any) as any
  )
    .update({
      calendar_url: args.calendar?.calendarUrl ?? null,
      conference_url: args.calendar?.meetUrl ?? null,
      external_event_id: args.calendar?.eventId ?? null,
      last_error: args.error ? clean(args.error, 1_000) : null,
      status: args.status,
      updated_at: new Date().toISOString(),
    })
    .eq("schedule_id", args.scheduleId)
    .eq("status", "creating")
    .select("status, calendar_url, conference_url, last_error, updated_at")
    .maybeSingle();
  if (error) throw error;
  if (data) return toDelivery(data);
  const existing = await fetchMeetingCalendarDelivery({
    admin: args.admin,
    scheduleId: args.scheduleId,
  });
  if (existing) return existing;
  throw new Error("Meeting calendar delivery row disappeared");
}

async function loadConfirmedSchedule(admin: AdminClient, scheduleId: string) {
  const { data: schedule, error: scheduleError } = await (
    admin.from("meeting_schedules" as any) as any
  )
    .select(
      "id, active_round_id, company_workspace_id, organizer_company_user_id, company_attendees, talent_id, title, status, confirmed_start_at, confirmed_end_at"
    )
    .eq("id", scheduleId)
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (
    !schedule ||
    schedule.status !== "confirmed" ||
    !schedule.confirmed_start_at ||
    !schedule.confirmed_end_at ||
    !schedule.active_round_id
  ) {
    throw new OrgHttpError(409, "확정된 미팅 시간을 찾지 못했어요.");
  }
  const [roundResult, candidateResult] = await Promise.all([
    (admin.from("meeting_schedule_rounds" as any) as any)
      .select(
        "id, invitation_snapshot, meeting_config_snapshot, selection_snapshot"
      )
      .eq("id", schedule.active_round_id)
      .eq("schedule_id", schedule.id)
      .maybeSingle(),
    (admin.from("talent_users" as any) as any)
      .select("user_id, email")
      .eq("user_id", schedule.talent_id)
      .maybeSingle(),
  ]);
  if (roundResult.error) throw roundResult.error;
  if (candidateResult.error) throw candidateResult.error;
  if (!roundResult.data || !candidateResult.data) {
    throw new OrgHttpError(409, "미팅 참석자 정보를 찾지 못했어요.");
  }
  return { candidate: candidateResult.data, round: roundResult.data, schedule };
}

function publicDeliveryError(error: unknown) {
  if (error instanceof GoogleCalendarError) {
    if (["NOT_CONNECTED", "AUTH_EXPIRED"].includes(error.code)) {
      return "일정 담당자의 Google Calendar 연결을 확인한 뒤 다시 시도해 주세요.";
    }
  }
  if (error instanceof OrgHttpError) return error.message;
  return "Calendar 초대와 Google Meet 링크를 만들지 못했어요. 다시 시도해 주세요.";
}

function createCalendarRuntime(admin: AdminClient) {
  const vendor = createComposioClient();
  const service = createGoogleCalendarService({
    store: createGoogleCalendarStore(admin),
    vendor,
    getAuthConfigId: () =>
      readComposioEnv("COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID"),
  });
  return { service, vendor };
}

export async function requireOrganizerGoogleCalendarConnection(args: {
  organizerCompanyUserId: string;
  organizerName: string;
}) {
  const admin = getSupabaseAdmin();
  try {
    await createCalendarRuntime(admin).service.requireActiveAccountId(
      args.organizerCompanyUserId
    );
  } catch (error) {
    console.error("[meeting-schedule/calendar-preflight]", {
      organizerCompanyUserId: args.organizerCompanyUserId,
      ...getIntegrationErrorDiagnostics(error),
      ...(error instanceof GoogleCalendarError ? { code: error.code } : {}),
    });
    if (error instanceof GoogleCalendarError) {
      const organizer = clean(args.organizerName, 80);
      throw new OrgHttpError(
        409,
        `${organizer ? `${organizer}님의 ` : "일정 담당자의 "}Google Calendar를 연결한 뒤 후보자에게 일정 요청을 보내 주세요.`
      );
    }
    throw new OrgHttpError(
      503,
      "Google Calendar 연결 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
    );
  }
}

export async function ensureMeetingCalendarEvent(scheduleIdValue: string) {
  const scheduleId = clean(scheduleIdValue, 80);
  if (!scheduleId) throw new OrgHttpError(400, "미팅 일정을 확인해 주세요.");
  const admin = getSupabaseAdmin();
  const { data: claimData, error: claimError } = await (admin.rpc as any)(
    "claim_meeting_schedule_calendar_event_v1",
    { p_schedule_id: scheduleId }
  );
  if (claimError?.code === "55000") {
    throw new OrgHttpError(409, "확정된 미팅 시간을 찾지 못했어요.");
  }
  if (claimError) throw claimError;
  const claim = claimData as Record<string, unknown> | null;
  if (claim?.claimed !== true) {
    const current = await fetchMeetingCalendarDelivery({ admin, scheduleId });
    if (current) return current;
    throw new Error("Meeting calendar delivery claim was not persisted");
  }

  try {
    const { candidate, round, schedule } = await loadConfirmedSchedule(
      admin,
      scheduleId
    );
    const timezone = parseTimezone(round);
    const startAt = new Date(schedule.confirmed_start_at);
    const endAt = new Date(schedule.confirmed_end_at);
    const invitationCandidate = isRecord(round.invitation_snapshot)
      ? round.invitation_snapshot.candidate
      : null;
    const candidateEmail =
      validEmail(candidate.email) ||
      validEmail(
        isRecord(invitationCandidate) ? invitationCandidate.email : null
      );
    const attendees = buildMeetingCalendarAttendeeEmails({
      candidateEmail,
      companyAttendees: schedule.company_attendees,
      organizerCompanyUserId: schedule.organizer_company_user_id,
    });
    if (!candidateEmail || attendees.length === 0) {
      throw new OrgHttpError(
        409,
        "후보자의 이메일을 확인할 수 없어 Calendar 초대를 보내지 못했어요."
      );
    }
    const meetingConfig = isRecord(round.meeting_config_snapshot)
      ? round.meeting_config_snapshot
      : null;

    const { service, vendor } = createCalendarRuntime(admin);
    const accountId = await service.requireActiveAccountId(
      schedule.organizer_company_user_id
    );
    const existingPayload = await vendor.executeTool<unknown>({
      accountId,
      arguments: buildGoogleCalendarEventLookupArguments({
        endAt,
        scheduleId: schedule.id,
        startAt,
      }),
      slug: GOOGLE_CALENDAR_LIST_EVENTS_TOOL,
      userId: schedule.organizer_company_user_id,
      version: GOOGLE_CALENDAR_TOOL_VERSION,
    });
    let calendar = parseExistingGoogleCalendarEvent(existingPayload);
    if (!calendar) {
      const createdPayload = await vendor.executeTool<unknown>({
        accountId,
        arguments: buildGoogleCalendarCreateEventArguments({
          attendees,
          endAt,
          invitationKind:
            clean(meetingConfig?.invitationKind, 80) === "process_stage"
              ? "process_stage"
              : "first_company_conversation",
          meetingPurpose: clean(meetingConfig?.meetingPurpose, 600) || null,
          processStageName:
            clean(meetingConfig?.processStageName, 80) || null,
          scheduleId: schedule.id,
          startAt,
          summary: schedule.title,
          timezone,
        }),
        slug: GOOGLE_CALENDAR_CREATE_EVENT_TOOL,
        userId: schedule.organizer_company_user_id,
        version: GOOGLE_CALENDAR_TOOL_VERSION,
      });
      calendar = parseCreatedGoogleCalendarEvent(createdPayload);
    }
    if (!calendar) {
      throw new Error("Google Calendar returned no event identifier");
    }
    return updateDelivery({
      admin,
      calendar,
      scheduleId,
      status: calendar.meetUrl
        ? "created"
        : calendar.conferencePending
          ? "creating"
          : "created_without_meet",
    });
  } catch (error) {
    console.error("[meeting-schedule/calendar-delivery]", {
      scheduleId,
      ...getIntegrationErrorDiagnostics(error),
      ...(error instanceof GoogleCalendarError ? { code: error.code } : {}),
    });
    return updateDelivery({
      admin,
      error: publicDeliveryError(error),
      scheduleId,
      status: "failed",
    });
  }
}

export async function retryMeetingCalendarEvent(args: {
  scheduleId: string;
  user: User;
  workspaceId: string;
}): Promise<MeetingCalendarRetryResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = clean(args.workspaceId, 80);
  const scheduleId = clean(args.scheduleId, 80);
  await assertOrgWorkspacePermission({
    admin,
    permission: "manage_candidates",
    user: args.user,
    workspaceId,
  });
  const { data, error } = await (admin.from("meeting_schedules" as any) as any)
    .select("id")
    .eq("id", scheduleId)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new OrgHttpError(404, "미팅 일정을 찾지 못했어요.");
  return { calendar: await ensureMeetingCalendarEvent(scheduleId), ok: true };
}
