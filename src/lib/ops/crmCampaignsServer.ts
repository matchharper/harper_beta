import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  CRM_CAMPAIGN_STATUSES,
  type OpsCrmCampaign,
  type OpsCrmCampaignSaveInput,
  type OpsCrmCampaignSaveResponse,
  type OpsCrmCampaignStatus,
  type OpsCrmCampaignsResponse,
} from "@/lib/ops/crmCampaigns";
import type { Database } from "@/types/database.types";

const MAX_NAME_LENGTH = 120;
const MAX_HTML_LENGTH = 100_000;
const MAX_SENDS_PER_USER = 100;
const SELECT_COLUMNS =
  "id,name,status,max_sends_per_user,html_content,created_at,updated_at" as const;

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

function normalizeStatus(value: unknown): OpsCrmCampaignStatus {
  const status = String(value ?? "draft").trim();
  if (!CRM_CAMPAIGN_STATUSES.includes(status as OpsCrmCampaignStatus)) {
    throw new Error("status must be draft, active, or paused");
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

function toCampaign(row: CampaignRow): OpsCrmCampaign {
  return {
    createdAt: row.created_at,
    htmlContent: row.html_content,
    id: row.id,
    maxSendsPerUser: row.max_sends_per_user,
    name: row.name,
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
    html_content: normalizeRequiredText(
      args.input.htmlContent,
      "htmlContent",
      MAX_HTML_LENGTH
    ),
    max_sends_per_user: normalizeMaxSends(args.input.maxSendsPerUser),
    name: normalizeRequiredText(args.input.name, "name", MAX_NAME_LENGTH),
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
