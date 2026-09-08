import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  calibrationPublicState,
  isCompanyRoleCalibrationStatus,
  sanitizeCompanyRoleCalibrationProfile,
  type CompanyRoleCalibrationProfileId,
  type CompanyRoleCalibrationResponse,
  type CompanyRoleCalibrationReviewStatus,
} from "@/lib/org/roleCalibration";
import type { OrgAgentAdminClient } from "@/lib/org/agent/data";
import { OrgHttpError } from "@/lib/org/server";

export type CalibrationRow = {
  company_workspace_id: string;
  created_at: string;
  id: string;
  payload: unknown;
  role_id: string;
  status: unknown;
  updated_at: string;
};

export type CompanyRoleCalibrationFeedbackReview = {
  profileId: CompanyRoleCalibrationProfileId;
  reason: string | null;
  status: Exclude<CompanyRoleCalibrationReviewStatus, "unreviewed">;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function fetchLatestCompanyRoleCalibration(args: {
  admin: OrgAgentAdminClient;
  calibrationId?: string | null;
  roleId: string;
  workspaceId: string;
}) {
  let query = (args.admin.from("company_role_calibrations" as any) as any)
    .select(
      "id, company_workspace_id, role_id, status, payload, created_at, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId);
  if (text(args.calibrationId)) {
    query = query.eq("id", text(args.calibrationId));
  } else {
    query = query.order("created_at", { ascending: false }).limit(1);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as CalibrationRow | null) ?? null;
}

export function serializeCompanyRoleCalibration(
  row: CalibrationRow | null,
  requestedProfileId?: string | null
): CompanyRoleCalibrationResponse {
  const status =
    row && isCompanyRoleCalibrationStatus(row.status) ? row.status : null;
  const state = calibrationPublicState(status);
  if (!row || !status) return { calibration: null, ok: true, state };

  let profiles = getCompanyRoleCalibrationProfiles(row);
  const exactProfileId = text(requestedProfileId);
  if (exactProfileId) {
    profiles = profiles.filter(
      (profile) => profile.profileId === exactProfileId
    );
  }
  return {
    calibration: {
      calibrationId: row.id,
      profiles: state === "ready" ? profiles : [],
      roleId: row.role_id,
      status,
      updatedAt: row.updated_at,
    },
    ok: true,
    state,
  };
}

export async function fetchCompanyRoleCalibrationResponse(args: {
  admin: OrgAgentAdminClient;
  calibrationId?: string | null;
  profileId?: string | null;
  roleId: string;
  workspaceId: string;
}) {
  const row = await fetchLatestCompanyRoleCalibration(args);
  return serializeCompanyRoleCalibration(row, args.profileId);
}

export function getCompanyRoleCalibrationProfiles(row: CalibrationRow) {
  const payload = object(row.payload);
  if (payload.schemaVersion !== 1) return [];
  return (Array.isArray(payload.profiles) ? payload.profiles : [])
    .map(sanitizeCompanyRoleCalibrationProfile)
    .filter((profile): profile is NonNullable<typeof profile> =>
      Boolean(profile)
    );
}

export async function fetchCompanyRoleCalibrationPromptIndex(args: {
  admin: OrgAgentAdminClient;
  preferredRoleId?: string | null;
  workspaceId: string;
}) {
  const preferredRoleId = text(args.preferredRoleId);
  let query = (args.admin.from("company_role_calibrations" as any) as any)
    .select(
      "id, company_workspace_id, role_id, status, payload, created_at, updated_at"
    )
    .eq("company_workspace_id", args.workspaceId)
    .in("status", ["ready", "sent", "completed"])
    .order("created_at", { ascending: false });
  query = preferredRoleId
    ? query.eq("role_id", preferredRoleId).limit(1)
    : query.limit(5);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as CalibrationRow[] | null) ?? [];
  if (rows.length === 0) return "-";
  return rows
    .map((row) => {
      const profiles = getCompanyRoleCalibrationProfiles(row).map(
        (profile) => ({
          displayedName: profile.display.name,
          headline: profile.display.headline,
          profileId: profile.profileId,
          reviewReason: profile.review.reason?.slice(0, 300) ?? null,
          reviewStatus: profile.review.status,
          selectionReason: profile.selection.reason.slice(0, 300),
        })
      );
      return JSON.stringify({
        calibrationId: row.id,
        preferredForCurrentConversation: row.role_id === preferredRoleId,
        profiles,
        roleId: row.role_id,
        sourceKind: "harper_prepared_profile_examples",
        status: row.status,
      });
    })
    .join("\n");
}

export async function applyCompanyRoleCalibrationFeedback(args: {
  admin: OrgAgentAdminClient;
  calibrationId: string;
  expectedCalibrationUpdatedAt: string;
  expectedRequest: string | null;
  finish: boolean;
  hiringBrief: string | null;
  reviews: CompanyRoleCalibrationFeedbackReview[];
  roleId: string;
  sourceMessageId: number;
  user: User;
  workspaceId: string;
}) {
  if (
    args.hiringBrief &&
    !args.reviews.some((review) => Boolean(text(review.reason)))
  ) {
    throw new OrgHttpError(
      400,
      "A Hiring Brief change requires an explicit feedback reason"
    );
  }
  const { data, error } = await (args.admin.rpc as any)(
    "apply_company_role_calibration_feedback_v1",
    {
      p_calibration_id: args.calibrationId,
      p_expected_calibration_updated_at: args.expectedCalibrationUpdatedAt,
      p_expected_request: args.expectedRequest,
      p_finish: args.finish,
      p_hiring_brief: args.hiringBrief,
      p_reviewed_by: args.user.id,
      p_reviews: args.reviews,
      p_role_id: args.roleId,
      p_source_message_id: args.sourceMessageId,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) {
    const message = text(error.message);
    if (message.includes("conflict")) {
      throw new OrgHttpError(
        409,
        "Calibration or Hiring Brief changed while feedback was being applied"
      );
    }
    throw error;
  }
  return object(data);
}
