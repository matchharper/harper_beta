import type { User } from "@supabase/supabase-js";
import {
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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  const availability = await fetchMeetingAvailabilityForCompanyUser({
    admin,
    companyUserId: args.user.id,
    workspaceId,
  });
  return {
    availability,
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
    return { availability: toSavedAvailability(data), ok: true };
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
  return { availability: toSavedAvailability(data), ok: true };
}
