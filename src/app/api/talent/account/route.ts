import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSlackActivityDeviceLabel,
  notifySlackActivity,
} from "@/lib/slackActivity";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_RESUME_BUCKET,
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  type AccountDeletionFeedback,
  type AccountDeletionReasonCode,
  parseAccountDeletionFeedback,
} from "@/lib/career/accountDeletionFeedback";

type UntypedAdminClient = SupabaseClient<any>;
type IdValue = string | number;

const ACCOUNT_DELETED_LOG_TYPE = "career_account_deleted";
const ACCOUNT_DELETION_FEEDBACK_KIND = "career-account-deletion-feedback";
const ACCOUNT_DELETION_FEEDBACK_SOURCE = "career-account-deletion";
const CAREER_PROFILE_ASSET_BUCKET = "company_logo";
const TALENT_NETWORK_CV_BUCKET = "talent-network-cv";
const DELETE_CHUNK_SIZE = 100;

type DeleteAccountBody = {
  confirmation?: string;
  feedback?: unknown;
};

type UpdateAccountBody = {
  name?: string;
};

type AccountDeletionContext = {
  bookmarkFolderIds: number[];
  companyQueryIds: string[];
  companyRunIds: string[];
  conversationIds: string[];
  discoveryRunIds: string[];
  documentStoragePaths: string[];
  email: string | null;
  emailInboundEventIds: string[];
  emailReplyJobIds: string[];
  messageIds: number[];
  networkCvPaths: string[];
  onboardingLeadIds: string[];
  recommendationIds: string[];
  resumeStoragePaths: string[];
  userId: string;
};

function uniqueValues<T extends IdValue>(values: unknown[]): T[] {
  const seen = new Set<IdValue>();
  const result: T[] = [];

  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value as T);
  }

  return result;
}

function chunkValues<T>(values: T[], chunkSize = DELETE_CHUNK_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function dbError(table: string, action: string, error: { message?: string }) {
  return new Error(
    `Failed to ${action} ${table}: ${error.message ?? "Unknown database error"}`
  );
}

async function selectRows<T>(
  admin: UntypedAdminClient,
  table: string,
  columns: string,
  applyFilter: (query: any) => any
): Promise<T[]> {
  const query = applyFilter(admin.from(table).select(columns));
  const { data, error } = await query;

  if (error) {
    throw dbError(table, "read", error);
  }

  return (data ?? []) as T[];
}

async function selectValues<T extends IdValue>(
  admin: UntypedAdminClient,
  table: string,
  column: string,
  applyFilter: (query: any) => any
) {
  const rows = await selectRows<Record<string, unknown>>(
    admin,
    table,
    column,
    applyFilter
  );
  return uniqueValues<T>(rows.map((row) => row[column]));
}

async function selectValuesIn<T extends IdValue>(
  admin: UntypedAdminClient,
  table: string,
  selectColumn: string,
  filterColumn: string,
  values: IdValue[]
) {
  if (values.length === 0) return [] as T[];

  const collected: T[] = [];
  for (const chunk of chunkValues(values)) {
    collected.push(
      ...(await selectValues<T>(admin, table, selectColumn, (query) =>
        query.in(filterColumn, chunk)
      ))
    );
  }

  return uniqueValues<T>(collected);
}

async function selectRowsIn<T>(
  admin: UntypedAdminClient,
  table: string,
  columns: string,
  filterColumn: string,
  values: IdValue[]
) {
  if (values.length === 0) return [] as T[];

  const collected: T[] = [];
  for (const chunk of chunkValues(values)) {
    collected.push(
      ...(await selectRows<T>(admin, table, columns, (query) =>
        query.in(filterColumn, chunk)
      ))
    );
  }

  return collected;
}

async function deleteEq(
  admin: UntypedAdminClient,
  table: string,
  column: string,
  value: IdValue | null | undefined
) {
  if (value === null || value === undefined || value === "") return;

  const { error } = await admin.from(table).delete().eq(column, value);
  if (error) {
    throw dbError(table, "delete from", error);
  }
}

async function deleteIn(
  admin: UntypedAdminClient,
  table: string,
  column: string,
  values: IdValue[]
) {
  const unique = uniqueValues(values);
  if (unique.length === 0) return;

  for (const chunk of chunkValues(unique)) {
    const { error } = await admin.from(table).delete().in(column, chunk);
    if (error) {
      throw dbError(table, "delete from", error);
    }
  }
}

async function updateIn(
  admin: UntypedAdminClient,
  table: string,
  column: string,
  values: IdValue[],
  payload: Record<string, unknown>
) {
  const unique = uniqueValues(values);
  if (unique.length === 0) return;

  for (const chunk of chunkValues(unique)) {
    const { error } = await admin.from(table).update(payload).in(column, chunk);
    if (error) {
      throw dbError(table, "update", error);
    }
  }
}

function extractNetworkCvPaths(
  rows: Array<{ text: string | null; url: string | null }>
) {
  const paths: string[] = [];

  for (const row of rows) {
    if (row.text) {
      try {
        const parsed = JSON.parse(row.text) as {
          cv_storage_bucket?: unknown;
          cv_storage_path?: unknown;
        };
        if (
          parsed?.cv_storage_bucket === TALENT_NETWORK_CV_BUCKET &&
          typeof parsed.cv_storage_path === "string"
        ) {
          paths.push(parsed.cv_storage_path);
        }
      } catch {
        // Older waitlist rows may contain free-form text.
      }
    }

    if (row.url && !/^https?:\/\//i.test(row.url)) {
      paths.push(row.url);
    }
  }

  return uniqueValues<string>(paths);
}

const normalizeAccountName = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

export async function PUT(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as UpdateAccountBody;
    const name = normalizeAccountName(body.name);

    if (!name) {
      return NextResponse.json(
        { error: "이름을 입력해주세요." },
        { status: 400 }
      );
    }
    const admin = getTalentSupabaseAdmin() as UntypedAdminClient;
    await ensureTalentUserRecord({ admin, user });

    const { data, error } = await admin
      .from("talent_users")
      .update({
        name,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("user_id, email, name")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to update talent account" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      profile: data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update account";
    console.error("[talent-account-update]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function collectAccountDeletionContext(
  admin: UntypedAdminClient,
  userId: string,
  email: string | null
): Promise<AccountDeletionContext> {
  const [
    talentProfiles,
    conversationIds,
    messageIds,
    recommendationIds,
    directDiscoveryRunIds,
    directOnboardingLeadIds,
    emailReplyRowsByTalent,
    companyQueryIds,
    directCompanyRunIds,
    bookmarkFolderIds,
    documentRows,
    waitlistRows,
  ] = await Promise.all([
    selectRows<{ resume_storage_path: string | null }>(
      admin,
      "talent_users",
      "resume_storage_path",
      (query) => query.eq("user_id", userId)
    ),
    selectValues<string>(admin, "talent_conversations", "id", (query) =>
      query.eq("user_id", userId)
    ),
    selectValues<number>(admin, "talent_messages", "id", (query) =>
      query.eq("user_id", userId)
    ),
    selectValues<string>(
      admin,
      "talent_opportunity_recommendation",
      "id",
      (query) => query.eq("talent_id", userId)
    ),
    selectValues<string>(admin, "opportunity_discovery_run", "id", (query) =>
      query.eq("talent_id", userId)
    ),
    selectValues<string>(
      admin,
      "career_email_onboarding_leads",
      "id",
      (query) => {
        const filters = [
          `talent_id.eq.${userId}`,
          `converted_user_id.eq.${userId}`,
        ];
        if (email) filters.push(`normalized_email.eq.${email}`);
        return query.or(filters.join(","));
      }
    ),
    selectRows<{ id: string; inbound_event_id: string | null }>(
      admin,
      "email_reply_jobs",
      "id, inbound_event_id",
      (query) => query.eq("talent_id", userId)
    ),
    selectValues<string>(admin, "queries", "query_id", (query) =>
      query.eq("user_id", userId)
    ),
    selectValues<string>(admin, "runs", "id", (query) =>
      query.eq("user_id", userId)
    ),
    selectValues<number>(admin, "bookmark_folder", "id", (query) =>
      query.eq("user_id", userId)
    ),
    selectRows<{ storage_path: string | null }>(
      admin,
      "talent_documents",
      "storage_path",
      (query) => query.eq("talent_id", userId)
    ),
    email
      ? selectRows<{ text: string | null; url: string | null }>(
          admin,
          "harper_waitlist",
          "text, url",
          (query) => query.eq("email", email)
        )
      : Promise.resolve([]),
  ]);

  const [
    discoveryRunIdsByConversation,
    onboardingLeadIdsByConversation,
    companyRunIdsByQuery,
  ] = await Promise.all([
    selectValuesIn<string>(
      admin,
      "opportunity_discovery_run",
      "id",
      "conversation_id",
      conversationIds
    ),
    selectValuesIn<string>(
      admin,
      "career_email_onboarding_leads",
      "id",
      "conversation_id",
      conversationIds
    ),
    selectValuesIn<string>(admin, "runs", "id", "query_id", companyQueryIds),
  ]);

  const emailReplyRows = emailReplyRowsByTalent;

  return {
    bookmarkFolderIds,
    companyQueryIds,
    companyRunIds: uniqueValues<string>([
      ...directCompanyRunIds,
      ...companyRunIdsByQuery,
    ]),
    conversationIds,
    discoveryRunIds: uniqueValues<string>([
      ...directDiscoveryRunIds,
      ...discoveryRunIdsByConversation,
    ]),
    documentStoragePaths: uniqueValues<string>(
      documentRows.flatMap((row) =>
        typeof row.storage_path === "string" && row.storage_path.trim()
          ? [row.storage_path]
          : []
      )
    ),
    email,
    emailInboundEventIds: uniqueValues<string>(
      emailReplyRows.map((row) => row.inbound_event_id)
    ),
    emailReplyJobIds: uniqueValues<string>(emailReplyRows.map((row) => row.id)),
    messageIds,
    networkCvPaths: extractNetworkCvPaths(waitlistRows),
    onboardingLeadIds: uniqueValues<string>([
      ...directOnboardingLeadIds,
      ...onboardingLeadIdsByConversation,
    ]),
    recommendationIds,
    resumeStoragePaths: uniqueValues<string>(
      talentProfiles.map((row) => row.resume_storage_path)
    ),
    userId,
  };
}

async function listStoragePrefix(
  admin: UntypedAdminClient,
  bucket: string,
  prefix: string
) {
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    throw new Error(
      `Failed to list ${bucket}/${prefix}: ${error.message ?? "Unknown storage error"}`
    );
  }

  return uniqueValues<string>(
    (data ?? [])
      .filter((item) => item.name && item.id !== null)
      .map((item) => `${prefix}/${item.name}`)
  );
}

async function removeStorageObjects(
  admin: UntypedAdminClient,
  bucket: string,
  paths: string[]
) {
  const unique = uniqueValues<string>(paths);
  if (unique.length === 0) return;

  for (const chunk of chunkValues(unique)) {
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) {
      throw new Error(
        `Failed to delete ${bucket} objects: ${error.message ?? "Unknown storage error"}`
      );
    }
  }
}

async function removeAccountStorage(
  admin: UntypedAdminClient,
  context: AccountDeletionContext
) {
  const [resumeFolderPaths, profileLogoPaths, profilePhotoPaths] =
    await Promise.all([
      listStoragePrefix(admin, TALENT_RESUME_BUCKET, context.userId),
      listStoragePrefix(
        admin,
        CAREER_PROFILE_ASSET_BUCKET,
        `career-profile/${context.userId}`
      ),
      listStoragePrefix(
        admin,
        CAREER_PROFILE_ASSET_BUCKET,
        `career-profile/photo/${context.userId}`
      ),
    ]);

  await Promise.all([
    removeStorageObjects(admin, TALENT_RESUME_BUCKET, [
      ...context.resumeStoragePaths,
      ...context.documentStoragePaths,
      ...resumeFolderPaths,
    ]),
    removeStorageObjects(admin, CAREER_PROFILE_ASSET_BUCKET, [
      ...profileLogoPaths,
      ...profilePhotoPaths,
    ]),
    removeStorageObjects(
      admin,
      TALENT_NETWORK_CV_BUCKET,
      context.networkCvPaths
    ),
  ]);
}

async function deleteCareerRows(
  admin: UntypedAdminClient,
  context: AccountDeletionContext
) {
  await deleteEq(admin, "contact_queue", "user_id", context.userId);

  await deleteIn(
    admin,
    "career_email_onboarding_events",
    "lead_id",
    context.onboardingLeadIds
  );
  await deleteIn(
    admin,
    "career_email_onboarding_leads",
    "id",
    context.onboardingLeadIds
  );

  await deleteEq(admin, "career_email_messages", "talent_id", context.userId);
  await deleteIn(
    admin,
    "career_email_messages",
    "talent_message_id",
    context.messageIds
  );
  await deleteIn(
    admin,
    "career_email_messages",
    "reply_job_id",
    context.emailReplyJobIds
  );

  await deleteEq(admin, "email_reply_aliases", "talent_id", context.userId);
  await deleteIn(
    admin,
    "email_reply_aliases",
    "conversation_id",
    context.conversationIds
  );
  await deleteIn(admin, "email_reply_jobs", "id", context.emailReplyJobIds);
  await deleteIn(
    admin,
    "email_inbound_events",
    "id",
    context.emailInboundEventIds
  );

  await deleteIn(
    admin,
    "talent_opportunity_chat_preview",
    "assistant_message_id",
    context.messageIds
  );
  await deleteIn(
    admin,
    "talent_opportunity_chat_preview",
    "conversation_id",
    context.conversationIds
  );
  await deleteIn(
    admin,
    "talent_opportunity_chat_preview",
    "recommendation_id",
    context.recommendationIds
  );
  await deleteIn(
    admin,
    "talent_opportunity_chat_preview",
    "discovery_run_id",
    context.discoveryRunIds
  );

  await deleteEq(admin, "talent_activity_events", "talent_id", context.userId);
  await deleteEq(admin, "talent_calls", "user_id", context.userId);
  await deleteEq(
    admin,
    "talent_conversation_summaries",
    "talent_id",
    context.userId
  );
  await deleteEq(admin, "talent_company_follow", "talent_id", context.userId);
  await deleteEq(
    admin,
    "talent_opportunity_delivery",
    "talent_id",
    context.userId
  );
  await deleteEq(admin, "talent_opportunity_fit", "talent_id", context.userId);
  await deleteEq(admin, "talent_opportunity_tag", "talent_id", context.userId);
  await deleteEq(
    admin,
    "talent_ops_profile_memos",
    "talent_id",
    context.userId
  );
  await deleteEq(admin, "talent_progress", "talent_id", context.userId);
  await deleteEq(
    admin,
    "talent_opportunity_recommendation",
    "talent_id",
    context.userId
  );

  await updateIn(
    admin,
    "opportunity_source_registry",
    "created_from_run_id",
    context.discoveryRunIds,
    { created_from_run_id: null }
  );
  await deleteIn(
    admin,
    "opportunity_discovery_run",
    "id",
    context.discoveryRunIds
  );
  await deleteEq(
    admin,
    "opportunity_discovery_run",
    "talent_id",
    context.userId
  );

  await deleteEq(admin, "talent_setting", "user_id", context.userId);
  await deleteEq(admin, "talent_insights", "talent_id", context.userId);
  await deleteEq(admin, "talent_extras", "talent_id", context.userId);
  await deleteEq(admin, "talent_educations", "talent_id", context.userId);
  await deleteEq(admin, "talent_experiences", "talent_id", context.userId);
  await deleteEq(admin, "talent_messages", "user_id", context.userId);
  await deleteEq(admin, "talent_conversations", "user_id", context.userId);
  await deleteEq(admin, "talent_users", "user_id", context.userId);
}

async function deleteCompanyWorkspaceRows(
  admin: UntypedAdminClient,
  context: AccountDeletionContext
) {
  await deleteEq(admin, "bookmark_folder_item", "user_id", context.userId);
  await deleteIn(
    admin,
    "bookmark_folder_share_note",
    "folder_id",
    context.bookmarkFolderIds
  );
  await deleteIn(
    admin,
    "bookmark_folder_share",
    "folder_id",
    context.bookmarkFolderIds
  );
  await deleteEq(admin, "bookmark_folder_share", "created_by", context.userId);
  await deleteEq(admin, "bookmark_folder", "user_id", context.userId);

  await deleteIn(admin, "run_variants", "run_id", context.companyRunIds);
  await deleteIn(admin, "runs_pages", "run_id", context.companyRunIds);
  await deleteIn(admin, "synthesized_summary", "run_id", context.companyRunIds);
  await deleteEq(admin, "messages", "user_id", context.userId);
  await deleteEq(admin, "runs", "user_id", context.userId);
  await deleteEq(admin, "queries", "user_id", context.userId);

  await deleteEq(admin, "candidate_mark", "user_id", context.userId);
  await deleteEq(admin, "connection", "user_id", context.userId);
  await deleteEq(admin, "request", "user_id", context.userId);
  await deleteEq(admin, "shortlist_memo", "user_id", context.userId);
  await deleteEq(admin, "unlock_profile", "company_user_id", context.userId);

  await deleteEq(admin, "payment_attempts", "user_id", context.userId);
  await deleteEq(admin, "billing_sessions", "user_id", context.userId);
  await deleteEq(admin, "payments", "user_id", context.userId);
  await deleteEq(admin, "credits_history", "user_id", context.userId);
  await deleteEq(admin, "credits", "user_id", context.userId);

  await deleteEq(admin, "settings", "user_id", context.userId);
  await deleteEq(
    admin,
    "company_user_workspace",
    "company_user_id",
    context.userId
  );
  await deleteEq(admin, "harper_waitlist_company", "user_id", context.userId);
  await deleteEq(admin, "company_users", "user_id", context.userId);
}

async function deleteLooseUserRows(
  admin: UntypedAdminClient,
  context: AccountDeletionContext
) {
  await deleteEq(admin, "logs", "user_id", context.userId);
  await deleteEq(admin, "feedback", "user_id", context.userId);
  await deleteEq(admin, "official_job_events", "user_id", context.userId);
  await deleteEq(admin, "profile_shares", "created_by", context.userId);
  await deleteEq(
    admin,
    "talent_network_referral_attributions",
    "referred_user_id",
    context.userId
  );
  await deleteEq(
    admin,
    "talent_network_referral_links",
    "referrer_user_id",
    context.userId
  );
}

async function deleteEmailMatchedRows(
  admin: UntypedAdminClient,
  context: AccountDeletionContext
) {
  if (!context.email) return;

  await deleteEq(admin, "harper_waitlist_company", "email", context.email);
  await deleteEq(admin, "harper_waitlist", "email", context.email);
}

async function deleteAccountData(
  admin: UntypedAdminClient,
  context: AccountDeletionContext,
  feedback: AccountDeletionFeedback | null
) {
  const now = new Date().toISOString();

  // Keep operational history (runs, recommendations, deliveries, CRM records)
  // and profile data intact. The soft-delete marker preserves the link after
  // the auth account is removed below.
  const { error: runError } = await admin
    .from("opportunity_discovery_run")
    .update({
      completed_at: now,
      error_message: "Account deleted before discovery completed",
      status: "failed",
      updated_at: now,
    })
    .eq("talent_id", context.userId)
    .in("status", ["queued", "running"]);
  if (runError) {
    throw dbError("opportunity_discovery_run", "cancel active", runError);
  }

  const { error: queueError } = await admin
    .from("contact_queue")
    .update({
      cancelled_at: now,
      last_error: "Account deleted",
      status: "cancelled",
      updated_at: now,
    })
    .eq("user_id", context.userId)
    .in("status", ["queued", "processing"]);
  if (queueError) {
    throw dbError("contact_queue", "cancel active", queueError);
  }

  const { error: replyJobError } = await admin
    .from("email_reply_jobs")
    .update({
      locked_at: null,
      locked_by: null,
      processed_at: now,
      skip_reason: "account_deleted",
      status: "skipped",
      updated_at: now,
    })
    .eq("talent_id", context.userId)
    .in("status", ["queued", "processing"]);
  if (replyJobError) {
    throw dbError("email_reply_jobs", "cancel active", replyJobError);
  }

  // Keep the talent profile and career history intact for operational analysis.
  // deleted_at is the single eligibility boundary for later matching and
  // delivery; the auth account is still removed below.
  const { error: profileError } = await admin
    .from("talent_users")
    .update({
      deleted_at: now,
      deletion_reason_code: feedback?.reasonCode ?? null,
      deletion_reason_detail: feedback?.detail ?? null,
      updated_at: now,
    })
    .eq("user_id", context.userId);
  if (profileError) {
    throw dbError("talent_users", "soft delete", profileError);
  }
}

async function notifyAccountDeletionSlack(
  req: NextRequest,
  context: AccountDeletionContext,
  user: NonNullable<Awaited<ReturnType<typeof getRequestUser>>>,
  feedback: AccountDeletionFeedback | null
) {
  const reasonLabels: Record<AccountDeletionReasonCode, string> = {
    difficult_to_use: "서비스 이용이 불편하거나 어려움",
    infrequent_use: "서비스를 자주 사용하지 않음",
    missing_opportunities: "원하는 기회나 추천을 찾지 못함",
    new_account: "다른 계정으로 다시 가입",
    other: "기타",
    privacy_concern: "개인정보 우려",
    recommendation_quality: "추천 품질이 기대와 다름",
  };

  try {
    await notifySlackActivity({
      action: "회원 탈퇴 완료",
      details: [
        { label: "Device", value: getSlackActivityDeviceLabel(req) },
        { label: "Source", value: "/career/settings" },
        ...(feedback?.reasonCode
          ? [{ label: "Reason", value: reasonLabels[feedback.reasonCode] }]
          : []),
        ...(feedback?.detail
          ? [{ label: "Feedback", value: feedback.detail }]
          : []),
      ],
      email: context.email ?? user.email,
      user,
      userId: context.userId,
    });
  } catch (slackError) {
    console.error("[talent-account-delete] slack notify failed:", slackError);
  }
}

async function upsertAccountDeletionFeedback(
  admin: UntypedAdminClient,
  req: NextRequest,
  feedback: AccountDeletionFeedback
) {
  const locale =
    req.headers.get("accept-language")?.split(",")[0]?.trim().slice(0, 35) ||
    null;
  const content = serializeAccountDeletionFeedback(feedback, locale, null);
  const { data: existingRows, error: readError } = await admin
    .from("feedback")
    .select("id")
    .eq("from", ACCOUNT_DELETION_FEEDBACK_SOURCE)
    .like("content", `%${feedback.submissionId}%`)
    .limit(1);

  if (readError) {
    throw dbError("feedback", "read", readError);
  }

  const existingId = existingRows?.[0]?.id;
  if (typeof existingId === "number") {
    const { error } = await admin
      .from("feedback")
      .update({ content, user_id: null })
      .eq("id", existingId)
      .eq("from", ACCOUNT_DELETION_FEEDBACK_SOURCE);

    if (error) {
      throw dbError("feedback", "update", error);
    }
    return { feedbackId: existingId, locale };
  }

  const { data, error } = await admin
    .from("feedback")
    .insert({
      content,
      from: ACCOUNT_DELETION_FEEDBACK_SOURCE,
      user_id: null,
    })
    .select("id")
    .single();

  if (error || typeof data?.id !== "number") {
    throw dbError("feedback", "write to", error ?? {});
  }

  return { feedbackId: data.id, locale };
}

function serializeAccountDeletionFeedback(
  feedback: AccountDeletionFeedback,
  locale: string | null,
  deletionCompletedAt: string | null
) {
  return JSON.stringify({
    deletionCompletedAt,
    detail: feedback.detail,
    kind: ACCOUNT_DELETION_FEEDBACK_KIND,
    locale,
    reasonCode: feedback.reasonCode,
    source: "/career/settings",
    status: deletionCompletedAt ? "completed" : "attempted",
    submissionId: feedback.submissionId,
    version: 1,
  });
}

async function markAccountDeletionFeedbackCompleted(
  admin: UntypedAdminClient,
  feedbackId: number,
  feedback: AccountDeletionFeedback,
  locale: string | null
) {
  const deletionCompletedAt = new Date().toISOString();
  const { error } = await admin
    .from("feedback")
    .update({
      content: serializeAccountDeletionFeedback(
        feedback,
        locale,
        deletionCompletedAt
      ),
      user_id: null,
    })
    .eq("id", feedbackId)
    .eq("from", ACCOUNT_DELETION_FEEDBACK_SOURCE);

  if (error) {
    console.error(
      "[talent-account-delete] feedback completion update failed:",
      error
    );
  }
}

async function insertAccountDeletionLog(admin: UntypedAdminClient) {
  const { error } = await admin.from("logs").insert({
    type: ACCOUNT_DELETED_LOG_TYPE,
    user_id: null,
  });

  if (error) {
    console.error("[talent-account-delete] deletion log insert failed:", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as DeleteAccountBody;
    if (body.confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
      return NextResponse.json(
        { error: "Account deletion confirmation is required." },
        { status: 400 }
      );
    }
    const feedback =
      body.feedback === undefined
        ? null
        : parseAccountDeletionFeedback(body.feedback);
    if (body.feedback !== undefined && !feedback) {
      return NextResponse.json(
        { error: "Invalid account deletion feedback." },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin() as UntypedAdminClient;
    const email =
      typeof user.email === "string" && user.email.trim()
        ? user.email.trim().toLowerCase()
        : null;
    const context = await collectAccountDeletionContext(admin, user.id, email);

    let storedFeedback: Awaited<
      ReturnType<typeof upsertAccountDeletionFeedback>
    > | null = null;
    if (feedback?.reasonCode || feedback?.detail) {
      try {
        storedFeedback = await upsertAccountDeletionFeedback(
          admin,
          req,
          feedback
        );
      } catch (feedbackError) {
        console.error(
          "[talent-account-delete] feedback save failed:",
          feedbackError
        );
      }
    }
    await deleteAccountData(admin, context, feedback);

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(
      user.id,
      false
    );
    if (authDeleteError) {
      throw new Error(
        authDeleteError.message ?? "Failed to delete Supabase auth user"
      );
    }

    if (feedback && storedFeedback) {
      await markAccountDeletionFeedbackCompleted(
        admin,
        storedFeedback.feedbackId,
        feedback,
        storedFeedback.locale
      );
    }
    await insertAccountDeletionLog(admin);
    await notifyAccountDeletionSlack(req, context, user, feedback);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete account";
    console.error("[talent-account-delete]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
