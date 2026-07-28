import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { calculateInternalConnectionConfirmationScheduledAt } from "@/lib/ops/connectionConfirmationSchedule";
import type { Json } from "@/types/database.types";

export const INTERNAL_CONNECTION_CONFIRMED_QUEUE_TYPE =
  "internal_connection_confirmed";

export type InternalConnectionConfirmationEmailMode =
  | "schedule"
  | "send_now"
  | "skip";

const INTERNAL_STAGE_TAGS = new Set([
  "내부:수락",
  "내부:아카이브",
  "내부:최종오퍼",
  "내부:보류",
  "내부:연결대기",
  "내부:프로세스중단",
  "내부:거절",
  "내부:추천",
  "내부:연결됨",
]);

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type ConnectionConfirmationQueueRow = {
  attempts: number;
  cancelled_at: string | null;
  created_at: string;
  id: string;
  last_error: string | null;
  locked_at: string | null;
  locked_by: string | null;
  payload: Json;
  recommendation_id: string | null;
  resend_email_id: string | null;
  role_id: string | null;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  type: string;
  updated_at: string;
  user_id: string;
};

export type InternalConnectionConfirmationRecommendation = {
  createdAt: string;
  feedback: string | null;
  feedbackAt: string | null;
  recommendationId: string;
  savedStage: string | null;
};

export type OpsMatchingConnectionConfirmationEmailStatus =
  | "cancelled"
  | "failed"
  | "scheduled"
  | "sending"
  | "sent";

export type OpsMatchingConnectionConfirmationEmail = {
  attempts: number;
  cancelledAt: string | null;
  canCancel: boolean;
  canSendNow: boolean;
  companyName: string | null;
  createdAt: string;
  id: string;
  lastError: string | null;
  locale: "en" | "ko";
  recommendationId: string | null;
  recipientResponse: {
    reason: string | null;
    receivedAt: string | null;
    status: "stopped";
  } | null;
  roleId: string | null;
  roleName: string | null;
  scheduledAt: string;
  sentAt: string | null;
  status: OpsMatchingConnectionConfirmationEmailStatus;
  talentId: string;
};

export type OpsMatchingConnectionConfirmationEmailActionResponse = {
  item: OpsMatchingConnectionConfirmationEmail;
  ok: true;
};

export class ConnectionConfirmationEmailError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ConnectionConfirmationEmailError";
    this.status = status;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLowerText(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeLocale(value: unknown): "en" | "ko" {
  return normalizeLowerText(value).startsWith("en") ? "en" : "ko";
}

function isAcceptedRecommendation(
  recommendation: InternalConnectionConfirmationRecommendation
) {
  const feedback = normalizeLowerText(recommendation.feedback);
  const savedStage = normalizeLowerText(recommendation.savedStage);
  return (
    feedback === "like" || feedback === "positive" || savedStage === "accepted"
  );
}

function acceptedAtForRecommendation(
  recommendation: InternalConnectionConfirmationRecommendation
) {
  const acceptedAt =
    normalizeText(recommendation.feedbackAt) ||
    normalizeText(recommendation.createdAt);
  const acceptedAtMs = Date.parse(acceptedAt);
  if (!Number.isFinite(acceptedAtMs)) {
    throw new Error("Recommendation acceptance time is invalid");
  }
  return new Date(acceptedAtMs);
}

function isInternalStageTag(value: unknown) {
  const tag = normalizeLowerText(value);
  return (
    INTERNAL_STAGE_TAGS.has(normalizeText(value)) || tag.startsWith("내부단계:")
  );
}

function normalizeQueueStatus(
  value: string
): OpsMatchingConnectionConfirmationEmailStatus {
  if (value === "processing") return "sending";
  if (value === "sent") return "sent";
  if (value === "cancelled" || value === "stopped") return "cancelled";
  if (value === "failed") return "failed";
  return "scheduled";
}

function toConnectionConfirmationEmail(
  row: ConnectionConfirmationQueueRow
): OpsMatchingConnectionConfirmationEmail {
  const payload = asRecord(row.payload);
  const rawRecipientResponse = asRecord(payload.recipientResponse);
  const recipientResponse =
    normalizeLowerText(rawRecipientResponse.status) === "stopped"
      ? {
          reason: normalizeText(rawRecipientResponse.reason) || null,
          receivedAt: normalizeText(rawRecipientResponse.receivedAt) || null,
          status: "stopped" as const,
        }
      : null;
  const status = normalizeQueueStatus(row.status);
  return {
    attempts: row.attempts,
    cancelledAt: row.cancelled_at,
    canCancel: row.status === "queued" || row.status === "failed",
    canSendNow: ["queued", "failed", "cancelled"].includes(row.status),
    companyName: normalizeText(payload.companyName) || null,
    createdAt: row.created_at,
    id: row.id,
    lastError: row.last_error,
    locale: normalizeLocale(payload.locale),
    recommendationId: row.recommendation_id,
    recipientResponse,
    roleId: row.role_id,
    roleName: normalizeText(payload.roleName) || null,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    status,
    talentId: row.user_id,
  };
}

async function fetchQueueSnapshot(args: {
  admin: AdminClient;
  roleId: string;
  talentId: string;
}) {
  const [talentResult, settingResult, roleResult] = await Promise.all([
    args.admin
      .from("talent_users")
      .select("name")
      .eq("user_id", args.talentId)
      .maybeSingle(),
    args.admin
      .from("talent_setting")
      .select("setting_locale, preferred_locale")
      .eq("user_id", args.talentId)
      .maybeSingle(),
    args.admin
      .from("company_roles")
      .select("name, company_workspace_id")
      .eq("role_id", args.roleId)
      .maybeSingle(),
  ]);

  if (talentResult.error) throw talentResult.error;
  if (settingResult.error) throw settingResult.error;
  if (roleResult.error) throw roleResult.error;

  let companyName = "";
  const workspaceId = normalizeText(roleResult.data?.company_workspace_id);
  if (workspaceId) {
    const { data, error } = await args.admin
      .from("company_workspace")
      .select("company_name")
      .eq("company_workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    companyName = normalizeText(data?.company_name);
  }

  return {
    companyName,
    locale: normalizeLocale(
      settingResult.data?.setting_locale ??
        settingResult.data?.preferred_locale ??
        "ko"
    ),
    roleName: normalizeText(roleResult.data?.name),
    talentName: normalizeText(talentResult.data?.name),
  };
}

async function fetchExistingQueue(args: {
  admin: AdminClient;
  recommendationId: string;
}) {
  const { data, error } = await (args.admin.from("contact_queue" as any) as any)
    .select(
      "id, user_id, role_id, recommendation_id, scheduled_at, type, status, sent_at, cancelled_at, created_at, updated_at, payload, attempts, locked_at, locked_by, resend_email_id, last_error"
    )
    .eq("type", INTERNAL_CONNECTION_CONFIRMED_QUEUE_TYPE)
    .eq("recommendation_id", args.recommendationId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ConnectionConfirmationQueueRow | null;
}

function cancellationSource(row: ConnectionConfirmationQueueRow) {
  return normalizeText(asRecord(asRecord(row.payload).cancellation).source);
}

async function skipInternalConnectionConfirmationEmail(args: {
  actorEmail?: string | null;
  admin: AdminClient;
  recommendationId: string;
}) {
  const existing = await fetchExistingQueue({
    admin: args.admin,
    recommendationId: args.recommendationId,
  });
  if (
    !existing ||
    !["queued", "failed", "cancelled"].includes(existing.status)
  ) {
    return existing ? toConnectionConfirmationEmail(existing) : null;
  }

  const now = new Date().toISOString();
  const payload = {
    ...asRecord(existing.payload),
    cancellation: {
      at: now,
      by: normalizeText(args.actorEmail) || null,
      source: "transition_skipped",
    },
  };
  const { data, error } = await (args.admin.from("contact_queue" as any) as any)
    .update({
      cancelled_at: now,
      last_error: null,
      locked_at: null,
      locked_by: null,
      payload: payload as Json,
      status: "cancelled",
    })
    .eq("id", existing.id)
    .in("status", ["queued", "failed", "cancelled"])
    .select(
      "id, user_id, role_id, recommendation_id, scheduled_at, type, status, sent_at, cancelled_at, created_at, updated_at, payload, attempts, locked_at, locked_by, resend_email_id, last_error"
    )
    .maybeSingle();
  if (error) throw error;
  return data
    ? toConnectionConfirmationEmail(data as ConnectionConfirmationQueueRow)
    : null;
}

export async function scheduleInternalConnectionConfirmationEmail(args: {
  actorEmail?: string | null;
  admin?: AdminClient;
  recommendation: InternalConnectionConfirmationRecommendation;
  roleId: string;
  stageChangedAt?: Date;
  talentId: string;
}) {
  if (!isAcceptedRecommendation(args.recommendation)) return null;

  const admin = args.admin ?? getSupabaseAdmin();
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  if (!roleId || !talentId) return null;

  const existing = await fetchExistingQueue({
    admin,
    recommendationId: args.recommendation.recommendationId,
  });
  if (existing) {
    if (
      existing.status !== "cancelled" ||
      cancellationSource(existing) !== "stage_changed"
    ) {
      return toConnectionConfirmationEmail(existing);
    }
  }

  const stageChangedAt = args.stageChangedAt ?? new Date();
  const acceptedAt = acceptedAtForRecommendation(args.recommendation);
  const scheduledAt = calculateInternalConnectionConfirmationScheduledAt({
    acceptedAt,
    stageChangedAt,
  });
  const snapshot = await fetchQueueSnapshot({ admin, roleId, talentId });
  const previousPayload = asRecord(existing?.payload);
  const payload: Record<string, unknown> = {
    ...previousPayload,
    acceptedAt: acceptedAt.toISOString(),
    companyName: snapshot.companyName,
    createdBy: normalizeText(args.actorEmail) || null,
    locale: snapshot.locale,
    roleName: snapshot.roleName,
    source: "ops_matching_pending_connection",
    talentName: snapshot.talentName,
  };
  delete payload.cancellation;
  delete payload.manualOverride;

  if (existing) {
    const { data, error } = await (admin.from("contact_queue" as any) as any)
      .update({
        attempts: 0,
        cancelled_at: null,
        last_error: null,
        locked_at: null,
        locked_by: null,
        payload: payload as Json,
        scheduled_at: scheduledAt.toISOString(),
        status: "queued",
      })
      .eq("id", existing.id)
      .eq("status", "cancelled")
      .select(
        "id, user_id, role_id, recommendation_id, scheduled_at, type, status, sent_at, cancelled_at, created_at, updated_at, payload, attempts, locked_at, locked_by, resend_email_id, last_error"
      )
      .maybeSingle();
    if (error) throw error;
    return data
      ? toConnectionConfirmationEmail(data as ConnectionConfirmationQueueRow)
      : null;
  }

  const { data, error } = await (admin.from("contact_queue" as any) as any)
    .insert({
      payload: payload as Json,
      recommendation_id: args.recommendation.recommendationId,
      role_id: roleId,
      scheduled_at: scheduledAt.toISOString(),
      status: "queued",
      type: INTERNAL_CONNECTION_CONFIRMED_QUEUE_TYPE,
      user_id: talentId,
    })
    .select(
      "id, user_id, role_id, recommendation_id, scheduled_at, type, status, sent_at, cancelled_at, created_at, updated_at, payload, attempts, locked_at, locked_by, resend_email_id, last_error"
    )
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const raced = await fetchExistingQueue({
        admin,
        recommendationId: args.recommendation.recommendationId,
      });
      return raced ? toConnectionConfirmationEmail(raced) : null;
    }
    throw error;
  }
  return toConnectionConfirmationEmail(data as ConnectionConfirmationQueueRow);
}

export async function cancelInternalConnectionConfirmationEmailsForStageChange(args: {
  actorEmail?: string | null;
  admin?: AdminClient;
  roleId: string;
  talentId: string;
}) {
  const admin = args.admin ?? getSupabaseAdmin();
  const { data, error } = await (admin.from("contact_queue" as any) as any)
    .select(
      "id, user_id, role_id, recommendation_id, scheduled_at, type, status, sent_at, cancelled_at, created_at, updated_at, payload, attempts, locked_at, locked_by, resend_email_id, last_error"
    )
    .eq("type", INTERNAL_CONNECTION_CONFIRMED_QUEUE_TYPE)
    .eq("user_id", args.talentId)
    .eq("role_id", args.roleId)
    .in("status", ["queued", "failed"]);
  if (error) throw error;

  const now = new Date().toISOString();
  for (const rawRow of data ?? []) {
    const row = rawRow as ConnectionConfirmationQueueRow;
    const payload = {
      ...asRecord(row.payload),
      cancellation: {
        at: now,
        by: normalizeText(args.actorEmail) || null,
        source: "stage_changed",
      },
    };
    const { error: updateError } = await (
      admin.from("contact_queue" as any) as any
    )
      .update({
        cancelled_at: now,
        last_error: "stage_changed",
        locked_at: null,
        locked_by: null,
        payload: payload as Json,
        status: "cancelled",
      })
      .eq("id", row.id)
      .in("status", ["queued", "failed"]);
    if (updateError) throw updateError;
  }
}

export async function syncInternalConnectionConfirmationEmailForStage(args: {
  actorEmail?: string | null;
  admin?: AdminClient;
  emailMode?: InternalConnectionConfirmationEmailMode;
  recommendation: InternalConnectionConfirmationRecommendation | null;
  roleId: string;
  stage: string;
  talentId: string;
}) {
  if (
    args.stage === "pending_connection" &&
    args.recommendation &&
    isAcceptedRecommendation(args.recommendation)
  ) {
    if (args.emailMode === "skip") {
      return skipInternalConnectionConfirmationEmail({
        actorEmail: args.actorEmail,
        admin: args.admin ?? getSupabaseAdmin(),
        recommendationId: args.recommendation.recommendationId,
      });
    }

    const item = await scheduleInternalConnectionConfirmationEmail({
      actorEmail: args.actorEmail,
      admin: args.admin,
      recommendation: args.recommendation,
      roleId: args.roleId,
      talentId: args.talentId,
    });
    if (args.emailMode === "send_now" && item?.canSendNow) {
      const response = await updateInternalConnectionConfirmationEmail({
        action: "send_now",
        actorEmail: args.actorEmail,
        admin: args.admin,
        queueId: item.id,
        talentId: args.talentId,
      });
      return response.item;
    }
    return item;
  }

  if (args.stage !== "pending_connection") {
    await cancelInternalConnectionConfirmationEmailsForStageChange({
      actorEmail: args.actorEmail,
      admin: args.admin,
      roleId: args.roleId,
      talentId: args.talentId,
    });
  }
  return null;
}

export async function fetchInternalConnectionConfirmationEmails(args: {
  admin?: AdminClient;
  roleId?: string | null;
  talentId: string;
}) {
  const admin = args.admin ?? getSupabaseAdmin();
  let query = (admin.from("contact_queue" as any) as any)
    .select(
      "id, user_id, role_id, recommendation_id, scheduled_at, type, status, sent_at, cancelled_at, created_at, updated_at, payload, attempts, locked_at, locked_by, resend_email_id, last_error"
    )
    .eq("type", INTERNAL_CONNECTION_CONFIRMED_QUEUE_TYPE)
    .eq("user_id", args.talentId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (normalizeText(args.roleId)) {
    query = query.eq("role_id", normalizeText(args.roleId));
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ConnectionConfirmationQueueRow[]).map(
    toConnectionConfirmationEmail
  );
}

async function assertQueueCanSend(args: {
  admin: AdminClient;
  row: ConnectionConfirmationQueueRow;
}) {
  const recommendationId = normalizeText(args.row.recommendation_id);
  const roleId = normalizeText(args.row.role_id);
  if (!recommendationId || !roleId) {
    throw new ConnectionConfirmationEmailError(
      409,
      "메일에 연결된 recommendation 또는 role이 없습니다."
    );
  }

  const { data: recommendation, error: recommendationError } = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select("id, talent_id, role_id, feedback, saved_stage")
    .eq("id", recommendationId)
    .eq("talent_id", args.row.user_id)
    .eq("role_id", roleId)
    .maybeSingle();
  if (recommendationError) throw recommendationError;
  if (
    !recommendation ||
    !isAcceptedRecommendation({
      createdAt: args.row.created_at,
      feedback: recommendation.feedback ?? null,
      feedbackAt: null,
      recommendationId,
      savedStage: recommendation.saved_stage ?? null,
    })
  ) {
    throw new ConnectionConfirmationEmailError(
      409,
      "Talent의 수락 상태가 아니어서 발송할 수 없습니다."
    );
  }

  const { data: tags, error: tagError } = await (
    args.admin.from("talent_opportunity_tag" as any) as any
  )
    .select("id, tag, created_at, updated_at")
    .eq("opportunity_id", roleId)
    .eq("talent_id", args.row.user_id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (tagError) throw tagError;
  const latestStage = (tags ?? []).find((tag: { tag?: string }) =>
    isInternalStageTag(tag.tag)
  );
  if (normalizeText(latestStage?.tag) !== "내부:연결대기") {
    throw new ConnectionConfirmationEmailError(
      409,
      "현재 연결 대기 상태가 아니어서 발송할 수 없습니다."
    );
  }
}

async function fetchActionQueue(args: {
  admin: AdminClient;
  queueId: string;
  talentId: string;
}) {
  const { data, error } = await (args.admin.from("contact_queue" as any) as any)
    .select(
      "id, user_id, role_id, recommendation_id, scheduled_at, type, status, sent_at, cancelled_at, created_at, updated_at, payload, attempts, locked_at, locked_by, resend_email_id, last_error"
    )
    .eq("id", args.queueId)
    .eq("user_id", args.talentId)
    .eq("type", INTERNAL_CONNECTION_CONFIRMED_QUEUE_TYPE)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ConnectionConfirmationEmailError(
      404,
      "연결 확정 안내 메일을 찾을 수 없습니다."
    );
  }
  return data as ConnectionConfirmationQueueRow;
}

export async function updateInternalConnectionConfirmationEmail(args: {
  action: "cancel" | "send_now";
  actorEmail?: string | null;
  admin?: AdminClient;
  queueId: string;
  talentId: string;
}): Promise<OpsMatchingConnectionConfirmationEmailActionResponse> {
  const admin = args.admin ?? getSupabaseAdmin();
  const row = await fetchActionQueue({
    admin,
    queueId: args.queueId,
    talentId: args.talentId,
  });
  const now = new Date().toISOString();
  const actorEmail = normalizeText(args.actorEmail) || null;

  if (args.action === "cancel") {
    if (row.status !== "queued" && row.status !== "failed") {
      throw new ConnectionConfirmationEmailError(
        409,
        "예약 또는 실패 상태의 메일만 취소할 수 있습니다."
      );
    }
    const payload = {
      ...asRecord(row.payload),
      cancellation: {
        at: now,
        by: actorEmail,
        source: "ops",
      },
    };
    const { data, error } = await (admin.from("contact_queue" as any) as any)
      .update({
        cancelled_at: now,
        last_error: null,
        locked_at: null,
        locked_by: null,
        payload: payload as Json,
        status: "cancelled",
      })
      .eq("id", row.id)
      .eq("status", row.status)
      .select(
        "id, user_id, role_id, recommendation_id, scheduled_at, type, status, sent_at, cancelled_at, created_at, updated_at, payload, attempts, locked_at, locked_by, resend_email_id, last_error"
      )
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new ConnectionConfirmationEmailError(
        409,
        "메일 상태가 변경되어 취소하지 못했습니다."
      );
    }
    return {
      item: toConnectionConfirmationEmail(
        data as ConnectionConfirmationQueueRow
      ),
      ok: true,
    };
  }

  if (!["queued", "failed", "cancelled"].includes(row.status)) {
    throw new ConnectionConfirmationEmailError(
      409,
      "발송 완료 또는 발송 중인 메일은 다시 발송할 수 없습니다."
    );
  }
  await assertQueueCanSend({ admin, row });

  const payload: Record<string, unknown> = {
    ...asRecord(row.payload),
    manualOverride: {
      bypassAcceptanceDelay: true,
      bypassWorkingTime: true,
      requestedAt: now,
      requestedBy: actorEmail,
    },
  };
  delete payload.cancellation;

  const { data, error } = await (admin.from("contact_queue" as any) as any)
    .update({
      attempts: 0,
      cancelled_at: null,
      last_error: null,
      locked_at: null,
      locked_by: null,
      payload: payload as Json,
      resend_email_id: null,
      scheduled_at: now,
      sent_at: null,
      status: "queued",
    })
    .eq("id", row.id)
    .eq("status", row.status)
    .select(
      "id, user_id, role_id, recommendation_id, scheduled_at, type, status, sent_at, cancelled_at, created_at, updated_at, payload, attempts, locked_at, locked_by, resend_email_id, last_error"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ConnectionConfirmationEmailError(
      409,
      "메일 상태가 변경되어 바로 발송하지 못했습니다."
    );
  }
  return {
    item: toConnectionConfirmationEmail(data as ConnectionConfirmationQueueRow),
    ok: true,
  };
}
