import "server-only";
import { resolveMeetingCalendarOwner, type MeetingCalendarOwner } from "./calendarOwner";
import { deliverMeetingCalendar } from "./calendarDelivery";
import { assertMeetingDeliveryCurrent } from "./coordinationStore";
import { agentContactDatabase } from "@/lib/agentContacts/store";

import type { User } from "@supabase/supabase-js";
import {
  createComposioClient,
  getIntegrationErrorDiagnostics,
  readComposioEnv,
} from "@/lib/integrations/composio";
import { createGoogleCalendarService } from "@/lib/integrations/googleCalendar";
import { GoogleCalendarError } from "@/lib/integrations/googleCalendarError";
import { createGoogleCalendarStore } from "@/lib/integrations/googleCalendarStore";
import { isValidCalendarTimezone } from "@/lib/integrations/googleCalendarTools";
import type {
  MeetingCalendarDelivery,
  MeetingCalendarDeliveryStatus,
  MeetingCalendarRetryResponse,
} from "@/lib/meetings/meetingCalendar";
import { buildMeetingCalendarAttendeeEmails } from "@/lib/meetings/meetingCalendar";
import { assertOrgWorkspacePermission, assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
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
    "cancelled",
  ]).has(status)
    ? status
    : "failed";
}

function toDelivery(row: Record<string, unknown>): MeetingCalendarDelivery {
  const owner = isRecord(row.calendar_owner) ? row.calendar_owner : null;
  return {
    organizerSource: owner?.kind === "personal" || owner?.kind === "harper" ? owner.kind : null,
    calendarUrl: row.status === "cancelled" ? null : clean(row.calendar_url, 2_048) || null,
    error: clean(row.last_error, 1_000) || null,
    meetUrl: row.status === "cancelled" ? null : clean(row.conference_url, 2_048) || null,
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
    .select("status, calendar_url, conference_url, last_error, updated_at, calendar_owner")
    .eq("schedule_id", args.scheduleId)
    .maybeSingle();
  if (error) throw error;
  return data ? toDelivery(data) : null;
}

async function loadConfirmedSchedule(admin: AdminClient, scheduleId: string) {
  const { data: schedule, error: scheduleError } = await (
    admin.from("meeting_schedules" as any) as any
  )
    .select(
      "id, active_round_id, company_workspace_id, organizer_company_user_id, company_attendees, talent_id, title, status, version, timezone, confirmed_start_at, confirmed_end_at"
    )
    .eq("id", scheduleId)
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (
    !schedule ||
    !["confirmed", "cancelled"].includes(schedule.status) ||
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

export async function hasActiveOrganizerGoogleCalendarConnection(args: {
  organizerCompanyUserId: string;
}) {
  const admin = getSupabaseAdmin();
  try {
    const status = await createCalendarRuntime(admin).service.getStatus(
      args.organizerCompanyUserId
    );
    return status.status === "active";
  } catch (error) {
    console.error("[meeting-schedule/calendar-status]", {
      organizerCompanyUserId: args.organizerCompanyUserId,
      ...getIntegrationErrorDiagnostics(error),
      ...(error instanceof GoogleCalendarError ? { code: error.code } : {}),
    });
    if (error instanceof GoogleCalendarError) return false;
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
  const { data: claim, error } = await (admin.rpc as any)("claim_meeting_calendar_delivery_v2", { p_schedule_id: scheduleId });
  if (error) throw error;
  if (!claim?.claimed) {
    const current = await fetchMeetingCalendarDelivery({ admin, scheduleId });
    if (!current) throw new Error("Calendar delivery record unavailable");
    return current;
  }
  try {
    const { candidate, round, schedule } = await loadConfirmedSchedule(admin, scheduleId);
    const { service, vendor } = createCalendarRuntime(admin);
    const owner = await resolveMeetingCalendarOwner({
      organizerId: schedule.organizer_company_user_id, pinned: claim.owner as MeetingCalendarOwner | null,
      personalAccount: id => service.requireActiveAccountId(id), getAccount: id => vendor.getAccount(id),
      authConfigId: readComposioEnv("COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID"),
      hostedAccountId: process.env.HARPER_GOOGLE_CALENDAR_ACCOUNT_ID,
      hostedUserId: process.env.HARPER_GOOGLE_CALENDAR_USER_ID,
    });
    if (owner.kind === "harper") {
      const primary = await vendor.calendarRequest({accountId:owner.accountId,userId:owner.userId,path:"/calendar/v3/calendars/primary",method:"GET"});
      const expectedEmail = process.env.HARPER_GOOGLE_CALENDAR_EMAIL?.trim().toLowerCase();
      if (!expectedEmail || primary.status!==200 || primary.data.id?.toLowerCase()!==expectedEmail) throw new OrgHttpError(409,"Harper 공용 Calendar 계정 설정을 확인해야 해요.");
    }
    // Bind credentials before any external write. A later reconnect must not create another event.
    const { data: bound, error: bindError } = await (admin.from("meeting_schedule_calendar_events" as any) as any)
      .update({ calendar_owner: owner }).eq("schedule_id", scheduleId).eq("lease_token", claim.token)
      .select("schedule_id").maybeSingle();
    if (bindError) throw bindError;
    if (!bound) throw new Error("Calendar delivery lease changed");
    const candidateEmail = validEmail(candidate.email);
    const attendees = buildMeetingCalendarAttendeeEmails({ candidateEmail, companyAttendees: schedule.company_attendees,
      organizerCompanyUserId: owner.kind === "personal" ? schedule.organizer_company_user_id : "" });
    if (!candidateEmail || !attendees.length) throw new Error("Meeting attendee email is unavailable");
    const delivered = await deliverMeetingCalendar({
      request: input => input.method === "GET"
        ? vendor.calendarRequest({ ...input, accountId: owner.accountId, userId: owner.userId })
        : agentContactDatabase().transaction(async q => {
          await assertMeetingDeliveryCurrent(q,scheduleId,Number(claim.version),claim.token);
          return vendor.calendarRequest({ ...input, accountId: owner.accountId, userId: owner.userId });
        }),
      scheduleId, version: Number(claim.version), status: schedule.status,
      startAt: schedule.confirmed_start_at, endAt: schedule.confirmed_end_at,
      timezone: schedule.timezone || parseTimezone(round), title: schedule.title,
      purpose: round.meeting_config_snapshot?.meetingPurpose || "",
      attendees, eventId: claim.eventId, deliveredVersion: claim.deliveredVersion, attempt: claim.attempt,
    });
    const { error: saveError } = await (admin.from("meeting_schedule_calendar_events" as any) as any).update({
      status: delivered.status, delivered_version: Number(claim.version),
      ...(delivered.calendar ? { external_event_id: delivered.calendar.eventId, calendar_url: delivered.calendar.calendarUrl, conference_url: delivered.calendar.meetUrl } : {}),
      last_error: null, lease_token: null, updated_at: new Date().toISOString(),
    }).eq("schedule_id", scheduleId).eq("lease_token", claim.token);
    if (saveError) throw saveError;
  } catch (error) {
    console.error("[meeting-schedule/calendar-delivery]", { scheduleId, ...getIntegrationErrorDiagnostics(error) });
    // Retain event ID, owner and URLs after partial success or an uncertain result.
    const { error: saveError } = await (admin.from("meeting_schedule_calendar_events" as any) as any)
      .update({ status: "failed", last_error: publicDeliveryError(error), updated_at: new Date().toISOString() })
      .eq("schedule_id", scheduleId).eq("lease_token", claim.token);
    if (saveError) throw saveError;
  }
  const delivery = await fetchMeetingCalendarDelivery({ admin, scheduleId });
  if (!delivery) throw new Error("Calendar delivery record unavailable");
  return delivery;
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
    .select("id, role_id")
    .eq("id", scheduleId)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new OrgHttpError(404, "미팅 일정을 찾지 못했어요.");
  await assertOrgRoleAccess({ admin, user: args.user, workspaceId, roleId: data.role_id });
  return { calendar: await ensureMeetingCalendarEvent(scheduleId), ok: true };
}
