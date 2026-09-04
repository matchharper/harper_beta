import { htmlToPlainText } from "@/lib/email/parse";
import { sendResendEmail } from "@/lib/email/send";
import {
  type OpsCrmBroadcast,
  type OpsCrmBroadcastAudienceInput,
  type OpsCrmBroadcastAudienceResponse,
  type OpsCrmBroadcastPauseResponse,
  type OpsCrmBroadcastQueueResponse,
  type OpsCrmBroadcastSaveInput,
  type OpsCrmBroadcastSaveResponse,
  type OpsCrmBroadcastStatus,
  type OpsCrmBroadcastTestEmailResponse,
  type OpsCrmBroadcastsResponse,
} from "@/lib/ops/crmBroadcasts";
import {
  CRM_CAMPAIGN_PREFERRED_LOCALES,
  type OpsCrmCampaignPreferredLocale,
} from "@/lib/ops/crmCampaigns";
import { buildCrmBroadcastPreviewDocument } from "@/lib/ops/crmCampaignEmailPreview";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import type { Database } from "@/types/database.types";
import type { User } from "@supabase/supabase-js";

const MAX_NAME_LENGTH = 120;
const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_LENGTH = 100_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BroadcastInsert =
  Database["public"]["Tables"]["crm_email_broadcasts"]["Insert"];
type BroadcastUpdate =
  Database["public"]["Tables"]["crm_email_broadcasts"]["Update"];
type BroadcastListRow =
  Database["public"]["Functions"]["list_crm_email_broadcasts"]["Returns"][number];

function normalizeOptionalId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const id = value.trim();
  if (!UUID_PATTERN.test(id)) throw new Error("id must be a valid UUID");
  return id;
}

function normalizeRequiredId(value: unknown, field: string) {
  const id = normalizeOptionalId(value);
  if (!id) throw new Error(`${field} is required`);
  return id;
}

function normalizeRequiredText(
  value: unknown,
  field: string,
  maxLength: number
) {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function normalizeRecipientPreferredLocale(
  value: unknown
): OpsCrmCampaignPreferredLocale | null {
  if (value == null || String(value).trim() === "") return null;
  const locale = String(value).trim().toLowerCase();
  if (
    !CRM_CAMPAIGN_PREFERRED_LOCALES.includes(
      locale as OpsCrmCampaignPreferredLocale
    )
  ) {
    throw new Error("recipientPreferredLocale must be ko, en, or empty");
  }
  return locale as OpsCrmCampaignPreferredLocale;
}

function normalizeBoolean(value: unknown, defaultValue: boolean) {
  if (value == null) return defaultValue;
  if (typeof value !== "boolean") throw new Error("boolean value is required");
  return value;
}

function normalizeScheduledAt(value: unknown) {
  if (value == null || String(value).trim() === "") return null;
  if (typeof value !== "string") {
    throw new Error("scheduledAt must be an ISO date string or empty");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("scheduledAt must be a valid date");
  }
  return parsed.toISOString();
}

function normalizeRequiredEmail(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(normalized)) {
    throw new Error(`${field} must be a valid email`);
  }
  return normalized;
}

function toCount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function effectiveStatus(row: BroadcastListRow): OpsCrmBroadcastStatus {
  if (row.status === "draft") return "draft";
  if (row.status === "paused" || toCount(row.paused_count) > 0) {
    return "paused";
  }
  const unfinished = toCount(row.queued_count) + toCount(row.processing_count);
  if (unfinished > 0) {
    if (
      toCount(row.sent_count) === 0 &&
      toCount(row.processing_count) === 0 &&
      row.scheduled_at &&
      new Date(row.scheduled_at).getTime() > Date.now()
    ) {
      return "scheduled";
    }
    return "sending";
  }
  return "completed";
}

function toBroadcast(row: BroadcastListRow): OpsCrmBroadcast {
  return {
    completedAt: row.completed_at,
    createdAt: row.created_at,
    deliveryCounts: {
      cancelled: toCount(row.cancelled_count),
      failed: toCount(row.failed_count),
      paused: toCount(row.paused_count),
      processing: toCount(row.processing_count),
      queued: toCount(row.queued_count),
      sent: toCount(row.sent_count),
      total: toCount(row.total_count),
    },
    htmlContent: row.html_content,
    id: row.id,
    name: row.name,
    queuedAt: row.queued_at,
    recipientOnboardingDoneOnly: row.recipient_onboarding_done_only,
    recipientPreferredLocale: normalizeRecipientPreferredLocale(
      row.recipient_preferred_locale
    ),
    scheduledAt: row.scheduled_at,
    status: effectiveStatus(row),
    subject: row.subject,
    updatedAt: row.updated_at,
  };
}

async function fetchBroadcastById(id: string) {
  const { data, error } = await getTalentSupabaseAdmin().rpc(
    "list_crm_email_broadcasts",
    { p_broadcast_id: id }
  );
  if (error) throw new Error(error.message ?? "Failed to load CRM broadcast");
  const row = data?.[0];
  if (!row) throw new Error("CRM broadcast not found");
  return toBroadcast(row);
}

export async function fetchOpsCrmBroadcasts(): Promise<OpsCrmBroadcastsResponse> {
  const { data, error } = await getTalentSupabaseAdmin().rpc(
    "list_crm_email_broadcasts",
    {}
  );
  if (error) throw new Error(error.message ?? "Failed to load CRM broadcasts");
  return { broadcasts: (data ?? []).map(toBroadcast) };
}

export async function saveOpsCrmBroadcast(args: {
  input: OpsCrmBroadcastSaveInput;
  user: User;
}): Promise<OpsCrmBroadcastSaveResponse> {
  const admin = getTalentSupabaseAdmin();
  const id = normalizeOptionalId(args.input.id);
  const fields = {
    html_content: normalizeRequiredText(
      args.input.htmlContent,
      "htmlContent",
      MAX_HTML_LENGTH
    ),
    name: normalizeRequiredText(args.input.name, "name", MAX_NAME_LENGTH),
    recipient_onboarding_done_only: normalizeBoolean(
      args.input.recipientOnboardingDoneOnly,
      true
    ),
    recipient_preferred_locale: normalizeRecipientPreferredLocale(
      args.input.recipientPreferredLocale
    ),
    scheduled_at: normalizeScheduledAt(args.input.scheduledAt),
    subject: normalizeRequiredText(
      args.input.subject,
      "subject",
      MAX_SUBJECT_LENGTH
    ),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const payload: BroadcastUpdate = fields;
    const { data, error } = await admin
      .from("crm_email_broadcasts")
      .update(payload)
      .eq("id", id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (error)
      throw new Error(error.message ?? "Failed to update CRM broadcast");
    if (!data) throw new Error("Only draft broadcasts can be edited");
    return { broadcast: await fetchBroadcastById(id), ok: true };
  }

  const payload: BroadcastInsert = {
    ...fields,
    created_by: args.user.id,
    status: "draft",
  };
  const { data, error } = await admin
    .from("crm_email_broadcasts")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(error.message ?? "Failed to create CRM broadcast");
  return { broadcast: await fetchBroadcastById(data.id), ok: true };
}

export async function fetchOpsCrmBroadcastAudienceCount(args: {
  input: OpsCrmBroadcastAudienceInput;
}): Promise<OpsCrmBroadcastAudienceResponse> {
  const recipientPreferredLocale = normalizeRecipientPreferredLocale(
    args.input.recipientPreferredLocale
  );
  const recipientOnboardingDoneOnly = normalizeBoolean(
    args.input.recipientOnboardingDoneOnly,
    true
  );
  const { data, error } = await getTalentSupabaseAdmin().rpc(
    "count_crm_email_broadcast_recipients",
    {
      p_onboarding_done_only: recipientOnboardingDoneOnly,
      p_preferred_locale: recipientPreferredLocale,
    }
  );
  if (error) {
    throw new Error(error.message ?? "Failed to count CRM broadcast audience");
  }
  return { recipientCount: toCount(data) };
}

export async function queueOpsCrmBroadcast(args: {
  broadcastId: unknown;
}): Promise<OpsCrmBroadcastQueueResponse> {
  const broadcastId = normalizeRequiredId(args.broadcastId, "broadcastId");
  const { data, error } = await getTalentSupabaseAdmin().rpc(
    "queue_crm_email_broadcast",
    { p_broadcast_id: broadcastId }
  );
  if (error) throw new Error(error.message ?? "Failed to queue CRM broadcast");
  return { ok: true, queuedRecipientCount: toCount(data) };
}

export async function setOpsCrmBroadcastPaused(args: {
  broadcastId: unknown;
  paused: unknown;
}): Promise<OpsCrmBroadcastPauseResponse> {
  const broadcastId = normalizeRequiredId(args.broadcastId, "broadcastId");
  const paused = normalizeBoolean(args.paused, false);
  const { error } = await getTalentSupabaseAdmin().rpc(
    "set_crm_email_broadcast_paused",
    { p_broadcast_id: broadcastId, p_paused: paused }
  );
  if (error) throw new Error(error.message ?? "Failed to update CRM broadcast");
  return { ok: true, paused };
}

export async function sendOpsCrmBroadcastTestEmail(args: {
  input: OpsCrmBroadcastSaveInput;
  user: User;
}): Promise<OpsCrmBroadcastTestEmailResponse> {
  const toEmail = normalizeRequiredEmail(args.user.email, "user.email");
  const subject = normalizeRequiredText(
    args.input.subject,
    "subject",
    MAX_SUBJECT_LENGTH
  );
  const htmlContent = normalizeRequiredText(
    args.input.htmlContent,
    "htmlContent",
    MAX_HTML_LENGTH
  );
  const locale = normalizeRecipientPreferredLocale(
    args.input.recipientPreferredLocale
  );
  const html = buildCrmBroadcastPreviewDocument(htmlContent, locale ?? "ko");
  const response = await sendResendEmail({
    html,
    subject: `[Harper CRM test] ${subject}`,
    text: htmlToPlainText(html),
    to: toEmail,
  });
  return {
    ok: true,
    resendEmailId: response.id ?? null,
    toEmail,
  };
}
