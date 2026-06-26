import type { TalentAdminClient } from "./admin";

export type ActiveInternalFitHoldQuestion = {
  fitId: string;
  summary: string;
};

const ACTIVE_HOLD_CANDIDATE_LIMIT = 20;
const NEW_INFORMATION_MAX_CHARS = 700;

function cleanText(value: unknown, maxChars: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasSavedNewInformation(criteria: unknown) {
  const record = asRecord(criteria);
  if (!record) return false;
  return Boolean(cleanText(record.new_information, NEW_INFORMATION_MAX_CHARS));
}

function extractHoldQuestionSummary(criteria: unknown) {
  const record = asRecord(criteria);
  if (record) {
    for (const key of ["summary", "question", "wouldChangeIf", "reason"]) {
      const text = cleanText(record[key], 1000);
      if (text) return text;
    }
  }
  const text = cleanText(criteria, 1000);
  return text || null;
}

function normalizeRoleId(value: unknown) {
  return cleanText(value, 120);
}

export function normalizeInternalFitReevaluationInformation(value: unknown) {
  return cleanText(value, NEW_INFORMATION_MAX_CHARS);
}

export async function fetchActiveInternalFitHoldQuestion(args: {
  admin: TalentAdminClient;
  userId: string;
}): Promise<ActiveInternalFitHoldQuestion | null> {
  const { data, error } = await (
    args.admin.from("talent_opportunity_fit" as any) as any
  )
    .select(
      "id, opportunity_id, score, reevaluation_criteria, last_evaluated_at, created_at"
    )
    .eq("talent_id", args.userId)
    .eq("label", "hold")
    .is("human_label", null)
    .order("score", { ascending: false })
    .order("last_evaluated_at", { ascending: true })
    .limit(ACTIVE_HOLD_CANDIDATE_LIMIT);

  if (error) {
    console.error("[InternalFitHoldQuestion] Failed to load hold fits", {
      error: error.message,
      userId: args.userId,
    });
    return null;
  }

  const candidates = Array.isArray(data)
    ? data
        .map((row: Record<string, unknown>) => {
          const fitId = cleanText(row.id, 120);
          const roleId = normalizeRoleId(row.opportunity_id);
          const summary = extractHoldQuestionSummary(row.reevaluation_criteria);
          if (
            !fitId ||
            !roleId ||
            !summary ||
            hasSavedNewInformation(row.reevaluation_criteria)
          ) {
            return null;
          }
          return { fitId, roleId, summary };
        })
        .filter(
          (row): row is { fitId: string; roleId: string; summary: string } =>
            Boolean(row)
        )
    : [];

  if (candidates.length === 0) return null;

  const roleIds = candidates.map((row) => row.roleId);
  const [rolesResponse, recommendationResponse] = await Promise.all([
    (args.admin.from("company_roles" as any) as any)
      .select("role_id, source_type, status, is_expired")
      .in("role_id", roleIds),
    (args.admin.from("talent_opportunity_recommendation" as any) as any)
      .select("role_id")
      .eq("talent_id", args.userId)
      .in("role_id", roleIds),
  ]);

  if (rolesResponse.error || recommendationResponse.error) {
    console.error("[InternalFitHoldQuestion] Failed to filter hold fits", {
      recommendationError: recommendationResponse.error?.message,
      roleError: rolesResponse.error?.message,
      userId: args.userId,
    });
    return null;
  }

  const recommendedRoleIds = new Set(
    (Array.isArray(recommendationResponse.data)
      ? recommendationResponse.data
      : []
    ).map((row: Record<string, unknown>) => normalizeRoleId(row.role_id))
  );
  const activeInternalRoleIds = new Set(
    (Array.isArray(rolesResponse.data) ? rolesResponse.data : [])
      .filter((row: Record<string, unknown>) => {
        const sourceType = cleanText(row.source_type, 80).toLowerCase();
        const status = cleanText(row.status, 80).toLowerCase();
        return (
          sourceType === "internal" &&
          status === "active" &&
          row.is_expired !== true
        );
      })
      .map((row: Record<string, unknown>) => normalizeRoleId(row.role_id))
  );

  const active = candidates.find(
    (candidate) =>
      activeInternalRoleIds.has(candidate.roleId) &&
      !recommendedRoleIds.has(candidate.roleId)
  );

  return active
    ? {
        fitId: active.fitId,
        summary: active.summary,
      }
    : null;
}

export async function recordInternalFitReevaluationInformation(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  fitId: string;
  newInformation: string;
  source: string;
  userId: string;
  userMessageId?: number | string | null;
}) {
  const newInformation = normalizeInternalFitReevaluationInformation(
    args.newInformation
  );
  if (!args.fitId || !newInformation) {
    return {
      ok: false,
      reason: "missing_required_fields",
    };
  }

  const active = await fetchActiveInternalFitHoldQuestion({
    admin: args.admin,
    userId: args.userId,
  });
  if (!active || active.fitId !== args.fitId) {
    return {
      ok: false,
      reason: "not_active_hidden_hold_question",
    };
  }

  const { data: row, error: fetchError } = await (
    args.admin.from("talent_opportunity_fit" as any) as any
  )
    .select("id, reevaluation_criteria")
    .eq("id", args.fitId)
    .eq("talent_id", args.userId)
    .eq("label", "hold")
    .is("human_label", null)
    .maybeSingle();

  if (fetchError) {
    throw new Error(
      fetchError.message ?? "Failed to load internal fit hold question."
    );
  }
  if (!row) {
    return {
      ok: false,
      reason: "fit_not_found",
    };
  }

  const previousCriteria = asRecord(row.reevaluation_criteria);
  const nextCriteria = {
    ...(previousCriteria ?? {}),
    summary:
      cleanText(previousCriteria?.summary, 1000) ||
      extractHoldQuestionSummary(row.reevaluation_criteria) ||
      active.summary,
    new_information: newInformation,
    answered_at: new Date().toISOString(),
  };

  const { error: updateError } = await (
    args.admin.from("talent_opportunity_fit" as any) as any
  )
    .update({
      reevaluation_criteria: nextCriteria,
      reevaluation_checked_at: null,
    })
    .eq("id", args.fitId)
    .eq("talent_id", args.userId)
    .eq("label", "hold")
    .is("human_label", null);

  if (updateError) {
    throw new Error(
      updateError.message ??
        "Failed to save internal fit reevaluation information."
    );
  }

  return {
    ok: true,
    fitId: args.fitId,
    newInformation,
  };
}
