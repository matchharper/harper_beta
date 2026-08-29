import type { User } from "@supabase/supabase-js";
import {
  type MeetingCalendarBusyBlock,
  type MeetingAvailabilityDocument,
  type MeetingAvailabilityResponse,
  MeetingAvailabilityValidationError,
  normalizeMeetingAvailabilityInput,
  type SavedMeetingAvailability,
} from "@/lib/meetings/availability";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Database, Json } from "@/types/database.types";

type MeetingAvailabilityRow =
  Database["public"]["Tables"]["meeting_availability"]["Row"];

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseStoredDocument(row: MeetingAvailabilityRow) {
  try {
    return normalizeMeetingAvailabilityInput({
      dateOverrides: row.date_overrides,
      timezone: row.timezone,
      weeklyRules: row.weekly_rules,
    });
  } catch (error) {
    console.error("[meeting-availability] invalid stored profile", {
      companyUserId: row.company_user_id,
      companyWorkspaceId: row.company_workspace_id,
      error,
    });
    throw new OrgHttpError(
      500,
      "저장된 인터뷰 가능 시간을 불러오지 못했습니다. Harper 팀에 문의해 주세요."
    );
  }
}

function toSavedAvailability(
  row: MeetingAvailabilityRow
): SavedMeetingAvailability {
  return {
    ...parseStoredDocument(row),
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function toCalendarBusyBlock(row: unknown): MeetingCalendarBusyBlock | null {
  if (!isRecord(row)) return null;
  const id = normalizeText(row.id);
  const startAt = normalizeText(row.start_at);
  const endAt = normalizeText(row.end_at);
  if (!id || !startAt || !endAt) return null;
  return {
    allDay: row.all_day === true,
    endAt,
    id,
    isBlocking: row.is_blocking !== false,
    startAt,
  };
}

async function fetchCalendarBusyBlocksForCompanyUser(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  companyUserId: string;
}) {
  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + 14 * 86_400_000);
  const { data, error } = await args.admin
    .from("company_user_calendar_busy_blocks")
    .select("id, start_at, end_at, all_day, is_blocking")
    .eq("company_user_id", args.companyUserId)
    .eq("provider", "google_calendar")
    .lt("start_at", windowEnd.toISOString())
    .gt("end_at", windowStart.toISOString())
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const block = toCalendarBusyBlock(row);
    return block ? [block] : [];
  });
}

export async function fetchMeetingAvailabilityForCompanyUser(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  companyUserId: string;
  workspaceId: string;
}): Promise<SavedMeetingAvailability | null> {
  const { data, error } = await args.admin
    .from("meeting_availability")
    .select(
      "company_workspace_id, company_user_id, timezone, weekly_rules, date_overrides, version, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("company_user_id", args.companyUserId)
    .maybeSingle();

  if (error) throw error;
  return data ? toSavedAvailability(data) : null;
}

async function assertAvailabilityAccess(args: {
  user: User;
  workspaceId: string;
}) {
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  const admin = getSupabaseAdmin();
  await assertOrgWorkspacePermission({
    admin,
    permission: "view",
    user: args.user,
    workspaceId,
  });
  return { admin, workspaceId };
}

export async function fetchMeetingAvailability(args: {
  user: User;
  workspaceId: string;
}): Promise<MeetingAvailabilityResponse> {
  const { admin, workspaceId } = await assertAvailabilityAccess(args);
  const [availability, calendarBusyBlocks] = await Promise.all([
    fetchMeetingAvailabilityForCompanyUser({
      admin,
      companyUserId: args.user.id,
      workspaceId,
    }),
    fetchCalendarBusyBlocksForCompanyUser({
      admin,
      companyUserId: args.user.id,
    }),
  ]);
  return {
    availability,
    calendarBusyBlocks,
    ok: true,
  };
}

export async function saveMeetingAvailability(args: {
  availability: unknown;
  expectedVersion: number | null;
  user: User;
  workspaceId: string;
}): Promise<MeetingAvailabilityResponse> {
  const { admin, workspaceId } = await assertAvailabilityAccess(args);
  if (
    args.expectedVersion !== null &&
    (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 1)
  ) {
    throw new OrgHttpError(400, "저장 버전을 확인해 주세요.");
  }

  let availability: MeetingAvailabilityDocument;
  try {
    availability = normalizeMeetingAvailabilityInput(args.availability);
  } catch (error) {
    if (error instanceof MeetingAvailabilityValidationError) {
      throw new OrgHttpError(400, error.message);
    }
    throw error;
  }

  const now = new Date().toISOString();
  const values = {
    date_overrides: availability.dateOverrides as Json,
    timezone: availability.timezone,
    updated_at: now,
    weekly_rules: availability.weeklyRules as Json,
  };

  if (args.expectedVersion === null) {
    const { data, error } = await admin
      .from("meeting_availability")
      .insert({
        ...values,
        company_user_id: args.user.id,
        company_workspace_id: workspaceId,
        version: 1,
      })
      .select(
        "company_workspace_id, company_user_id, timezone, weekly_rules, date_overrides, version, updated_at"
      )
      .single();

    if (error?.code === "23505") {
      throw new OrgHttpError(
        409,
        "다른 화면에서 가능 시간을 먼저 저장했어요. 최신 설정을 다시 불러와 주세요."
      );
    }
    if (error) throw error;
    return {
      availability: toSavedAvailability(data),
      calendarBusyBlocks: await fetchCalendarBusyBlocksForCompanyUser({
        admin,
        companyUserId: args.user.id,
      }),
      ok: true,
    };
  }

  const { data, error } = await admin
    .from("meeting_availability")
    .update({
      ...values,
      version: args.expectedVersion + 1,
    })
    .eq("company_workspace_id", workspaceId)
    .eq("company_user_id", args.user.id)
    .eq("version", args.expectedVersion)
    .select(
      "company_workspace_id, company_user_id, timezone, weekly_rules, date_overrides, version, updated_at"
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new OrgHttpError(
      409,
      "다른 화면에서 가능 시간이 바뀌었어요. 최신 설정을 다시 불러와 주세요."
    );
  }
  return {
    availability: toSavedAvailability(data),
    calendarBusyBlocks: await fetchCalendarBusyBlocksForCompanyUser({
      admin,
      companyUserId: args.user.id,
    }),
    ok: true,
  };
}

export async function updateMeetingCalendarBusyBlock(args: {
  busyBlockId: string;
  isBlocking: boolean;
  user: User;
  workspaceId: string;
}): Promise<MeetingCalendarBusyBlock> {
  const { admin } = await assertAvailabilityAccess(args);
  const busyBlockId = normalizeText(args.busyBlockId);
  if (!UUID_PATTERN.test(busyBlockId)) {
    throw new OrgHttpError(400, "Google Calendar 일정을 확인해 주세요.");
  }
  const { data, error } = await admin.rpc(
    "set_google_calendar_busy_block_blocking_v1",
    {
      p_busy_block_id: busyBlockId,
      p_company_user_id: args.user.id,
      p_is_blocking: args.isBlocking,
    }
  );
  if (error?.code === "P0002") {
    throw new OrgHttpError(404, "Google Calendar 일정을 찾지 못했어요.");
  }
  if (error?.code === "22023") {
    throw new OrgHttpError(400, "Google Calendar 일정을 확인해 주세요.");
  }
  if (error) throw error;
  const busyBlock = data ? toCalendarBusyBlock(data) : null;
  if (!busyBlock) {
    throw new OrgHttpError(404, "Google Calendar 일정을 찾지 못했어요.");
  }
  return busyBlock;
}
