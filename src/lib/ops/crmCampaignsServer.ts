import { createHmac, timingSafeEqual } from "crypto";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { sendResendEmail } from "@/lib/email/send";
import { buildCrmCampaignPreviewDocument } from "@/lib/ops/crmCampaignEmailPreview";
import {
  CRM_CAMPAIGN_PREFERRED_LOCALES,
  CRM_CAMPAIGN_STATUSES,
  type OpsCrmCampaign,
  type OpsCrmCampaignPreferredLocale,
  type OpsCrmCampaignSaveInput,
  type OpsCrmCampaignSaveResponse,
  type OpsCrmCampaignStatsResponse,
  type OpsCrmCampaignStatus,
  type OpsCrmCampaignTestEmailInput,
  type OpsCrmCampaignTestEmailResponse,
  type OpsCrmCampaignsResponse,
} from "@/lib/ops/crmCampaigns";
import type { Database } from "@/types/database.types";
import type { User } from "@supabase/supabase-js";

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_TITLE_LENGTH = 120;
const MAX_HTML_LENGTH = 100_000;
const MAX_SENDS_PER_USER = 100;
const MAX_TOTAL_SENDS = 1_000_000;
const DELIVERY_STATS_PAGE_SIZE = 1000;
const CLICK_STATS_PAGE_SIZE = 1000;
const CRM_CAMPAIGN_CLICK_LOG_TYPE_PREFIX = "crm_email_campaign_click:";
const SELECT_COLUMNS =
  "id,name,status,email_title,max_sends_per_user,max_total_sends,recipient_preferred_locale,html_content,created_at,updated_at" as const;

type CampaignRow = Database["public"]["Tables"]["crm_email_campaigns"]["Row"];
type CampaignUpdate =
  Database["public"]["Tables"]["crm_email_campaigns"]["Update"];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeOptionalText(
  value: unknown,
  field: string,
  maxLength: number
) {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.replace(/\r/g, "").trim();
  if (normalized.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer`);
  }
  return normalized;
}

function normalizeStatus(value: unknown): OpsCrmCampaignStatus {
  const status = String(value ?? "paused").trim();
  if (status === "draft") return "paused";
  if (!CRM_CAMPAIGN_STATUSES.includes(status as OpsCrmCampaignStatus)) {
    throw new Error("status must be active or paused");
  }
  return status as OpsCrmCampaignStatus;
}

function normalizeMaxSends(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SENDS_PER_USER) {
    throw new Error(
      `maxSendsPerUser must be an integer between 1 and ${MAX_SENDS_PER_USER}`
    );
  }
  return parsed;
}

function normalizeMaxTotalSends(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TOTAL_SENDS) {
    throw new Error(
      `maxTotalSends must be an integer between 1 and ${MAX_TOTAL_SENDS}`
    );
  }
  return parsed;
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

function normalizeRequiredEmail(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(normalized)) {
    throw new Error(`${field} must be a valid email`);
  }
  return normalized;
}

function normalizeRequiredUrlText(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > 3000) {
    throw new Error(`${field} must be 3000 characters or fewer`);
  }
  return normalized;
}

function getCrmCampaignClickLogType(campaignId: string) {
  return `${CRM_CAMPAIGN_CLICK_LOG_TYPE_PREFIX}${campaignId}`;
}

function readCrmCampaignClickSecret() {
  const secret =
    process.env.EMAIL_REPLY_TOKEN_SECRET?.trim() ||
    process.env.RESEND_WEBHOOK_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error(
      "EMAIL_REPLY_TOKEN_SECRET, RESEND_WEBHOOK_SECRET, or SUPABASE_SERVICE_ROLE_KEY is required"
    );
  }
  return secret;
}

function buildCrmCampaignClickSignaturePayload(args: {
  campaignId: string;
  discoveryRunId: string;
  talentId: string;
  targetUrl: string;
}) {
  return [
    args.campaignId,
    args.talentId,
    args.discoveryRunId,
    args.targetUrl,
  ].join("\n");
}

function createCrmCampaignClickSignature(args: {
  campaignId: string;
  discoveryRunId: string;
  talentId: string;
  targetUrl: string;
}) {
  return createHmac("sha256", readCrmCampaignClickSecret())
    .update(buildCrmCampaignClickSignaturePayload(args))
    .digest("hex");
}

function verifyCrmCampaignClickSignature(args: {
  campaignId: string;
  discoveryRunId: string;
  signature: string;
  talentId: string;
  targetUrl: string;
}) {
  const expected = createCrmCampaignClickSignature(args);
  const actual = args.signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(actual)) return false;

  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function toCampaign(row: CampaignRow): OpsCrmCampaign {
  return {
    createdAt: row.created_at,
    emailTitle: row.email_title ?? "",
    htmlContent: row.html_content,
    id: row.id,
    maxSendsPerUser: row.max_sends_per_user,
    maxTotalSends: row.max_total_sends,
    name: row.name,
    recipientPreferredLocale: normalizeRecipientPreferredLocale(
      row.recipient_preferred_locale
    ),
    status: normalizeStatus(row.status),
    updatedAt: row.updated_at,
  };
}

export async function fetchOpsCrmCampaigns(): Promise<OpsCrmCampaignsResponse> {
  const { data, error } = await getTalentSupabaseAdmin()
    .from("crm_email_campaigns")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed to load CRM campaigns");
  }

  return {
    campaigns: (data ?? []).map(toCampaign),
  };
}

export async function saveOpsCrmCampaign(args: {
  input: OpsCrmCampaignSaveInput;
}): Promise<OpsCrmCampaignSaveResponse> {
  const admin = getTalentSupabaseAdmin();
  const id = normalizeOptionalId(args.input.id);
  const payload = {
    email_title:
      normalizeOptionalText(
        args.input.emailTitle,
        "emailTitle",
        MAX_EMAIL_TITLE_LENGTH
      ) || null,
    html_content: normalizeRequiredText(
      args.input.htmlContent,
      "htmlContent",
      MAX_HTML_LENGTH
    ),
    max_sends_per_user: normalizeMaxSends(args.input.maxSendsPerUser),
    max_total_sends: normalizeMaxTotalSends(args.input.maxTotalSends),
    name: normalizeRequiredText(args.input.name, "name", MAX_NAME_LENGTH),
    recipient_preferred_locale: normalizeRecipientPreferredLocale(
      args.input.recipientPreferredLocale
    ),
    status: normalizeStatus(args.input.status),
    updated_at: new Date().toISOString(),
  } satisfies CampaignUpdate;

  if (id) {
    const { data, error } = await admin
      .from("crm_email_campaigns")
      .update(payload)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error)
      throw new Error(error.message ?? "Failed to update CRM campaign");
    if (!data) throw new Error("CRM campaign not found");
    return { campaign: toCampaign(data), ok: true };
  }

  const { data, error } = await admin
    .from("crm_email_campaigns")
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message ?? "Failed to create CRM campaign");
  return { campaign: toCampaign(data), ok: true };
}

export async function sendOpsCrmCampaignTestEmail(args: {
  input: OpsCrmCampaignTestEmailInput;
  user: User;
}): Promise<OpsCrmCampaignTestEmailResponse> {
  const toEmail = normalizeRequiredEmail(args.user.email, "user.email");
  const name = normalizeRequiredText(args.input.name, "name", MAX_NAME_LENGTH);
  const htmlContent = normalizeRequiredText(
    args.input.htmlContent,
    "htmlContent",
    MAX_HTML_LENGTH
  );
  const emailTitle = normalizeOptionalText(
    args.input.emailTitle,
    "emailTitle",
    MAX_EMAIL_TITLE_LENGTH
  );
  const status = normalizeStatus(args.input.status);
  const html = buildCrmCampaignPreviewDocument(htmlContent);
  const subject = `[Harper CRM test] ${name}${emailTitle ? ` + ${emailTitle}` : ""}`;
  const text = [
    "Periodic refresh CRM campaign test email.",
    "",
    `Campaign: ${name}`,
    ...(emailTitle ? [`Email title suffix: ${emailTitle}`] : []),
    `Status: ${status}`,
    "",
    "Open the HTML version to review the inserted content in the periodic refresh email frame.",
  ].join("\n");

  const response = await sendResendEmail({
    html,
    subject,
    text,
    to: toEmail,
  });

  return {
    ok: true,
    resendEmailId: response.id ?? null,
    toEmail,
  };
}

export async function fetchOpsCrmCampaignStats(args: {
  campaignId: unknown;
}): Promise<OpsCrmCampaignStatsResponse> {
  const campaignId = normalizeRequiredId(args.campaignId, "campaignId");
  const admin = getTalentSupabaseAdmin();
  const clickLogType = getCrmCampaignClickLogType(campaignId);

  const { count, error: countError } = await admin
    .from("crm_email_campaign_deliveries")
    .select("campaign_id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (countError) {
    throw new Error(countError.message ?? "Failed to count CRM deliveries");
  }

  const recipientIds = new Set<string>();
  for (let offset = 0; ; offset += DELIVERY_STATS_PAGE_SIZE) {
    const { data, error } = await admin
      .from("crm_email_campaign_deliveries")
      .select("talent_id")
      .eq("campaign_id", campaignId)
      .range(offset, offset + DELIVERY_STATS_PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message ?? "Failed to load CRM delivery stats");
    }

    const rows = data ?? [];
    for (const row of rows) {
      const talentId = String(row.talent_id ?? "").trim();
      if (talentId) recipientIds.add(talentId);
    }
    if (rows.length < DELIVERY_STATS_PAGE_SIZE) break;
  }

  const clickerIds = new Set<string>();
  for (let offset = 0; ; offset += CLICK_STATS_PAGE_SIZE) {
    const { data, error } = await admin
      .from("logs")
      .select("user_id")
      .eq("type", clickLogType)
      .range(offset, offset + CLICK_STATS_PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message ?? "Failed to load CRM click stats");
    }

    const rows = data ?? [];
    for (const row of rows) {
      const talentId = String(row.user_id ?? "").trim();
      if (talentId) clickerIds.add(talentId);
    }
    if (rows.length < CLICK_STATS_PAGE_SIZE) break;
  }

  return {
    stats: {
      campaignId,
      sentEmailCount: count ?? 0,
      uniqueClickerCount: clickerIds.size,
      uniqueRecipientCount: recipientIds.size,
    },
  };
}

export async function recordOpsCrmCampaignClick(args: {
  campaignId: unknown;
  discoveryRunId: unknown;
  signature: unknown;
  talentId: unknown;
  targetUrl: unknown;
  userAgent?: string | null;
}) {
  const campaignId = normalizeRequiredId(args.campaignId, "campaignId");
  const talentId = normalizeRequiredId(args.talentId, "talentId");
  const discoveryRunId = normalizeRequiredId(
    args.discoveryRunId,
    "discoveryRunId"
  );
  const targetUrl = normalizeRequiredUrlText(args.targetUrl, "targetUrl");
  const signature = normalizeOptionalText(args.signature, "signature", 200);
  if (
    !verifyCrmCampaignClickSignature({
      campaignId,
      discoveryRunId,
      signature,
      talentId,
      targetUrl,
    })
  ) {
    throw new Error("invalid CRM campaign click signature");
  }

  const { error } = await getTalentSupabaseAdmin()
    .from("logs")
    .insert({
      meta_data: {
        campaignId,
        clickedAt: new Date().toISOString(),
        discoveryRunId,
        targetUrl,
        userAgent:
          normalizeOptionalText(args.userAgent, "userAgent", 500) || null,
      },
      type: getCrmCampaignClickLogType(campaignId),
      user_id: talentId,
    });

  if (error) {
    throw new Error(error.message ?? "Failed to record CRM campaign click");
  }

  return { ok: true as const };
}
