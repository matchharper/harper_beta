import {
  fetchTalentInsights,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  getMergedChecklist,
  getTalentResumeSignedUrl,
} from "@/lib/talentOnboarding/server";
import { normalizeTalentInsightContent } from "@/lib/talentOnboarding/server";
import {
  ingestTalentProfileFromLinkedin,
  pickLinkedinUrl,
} from "@/lib/talentOnboarding/profileIngestion";
import { randomUUID } from "crypto";
import {
  appendHarperEmailFooterText,
  renderEmailBodyHtmlWithHarperFooter,
} from "@/lib/email/harperFooter";
import { createOpportunityDiscoveryRun } from "@/lib/opportunityDiscovery/store";
import { insertTalentActivityEvent } from "@/lib/talentOnboarding/activityEvents";
import { createEmailReplyAlias } from "@/lib/email/inbound";
import { buildReplySubject } from "@/lib/email/parse";
import { sendResendEmail } from "@/lib/email/send";
import type { MergedChecklistItem } from "@/lib/talentOnboarding/server";
import type { Database } from "@/types/database.types";

type TalentUserRow = Database["public"]["Tables"]["talent_users"]["Row"];
type TalentConversationRow =
  Database["public"]["Tables"]["talent_conversations"]["Row"];
type TalentExperienceRow =
  Database["public"]["Tables"]["talent_experiences"]["Row"];
type CareerEmailMessageInsert =
  Database["public"]["Tables"]["career_email_messages"]["Insert"];
type CareerEmailMessageUpdate =
  Database["public"]["Tables"]["career_email_messages"]["Update"];
type TalentAdminClient = ReturnType<typeof getTalentSupabaseAdmin>;
type UntypedAdminClient = TalentAdminClient & {
  from: (table: string) => any;
};

export type CareerTalentSummary = {
  userId: string;
  name: string | null;
  email: string | null;
  profilePicture: string | null;
  headline: string | null;
  currentCompanyName: string | null;
  currentRole: string | null;
  registeredLinkTypes: CareerTalentRegisteredLinkType[];
  hasRegisteredLink: boolean;
  hasResume: boolean;
  conversationStage: string | null;
  isOnboardingDone: boolean;
  insightCoverage: number;
  lastConversationAt: string | null;
  createdAt: string | null;
};

export type CareerTalentRegisteredLinkType = "linkedin" | "github" | "other";

export type CareerTalentListResponse = {
  talents: CareerTalentSummary[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type CareerTalentDetailResponse = {
  userId: string;
  name: string | null;
  email: string | null;
  profilePicture: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  resumeFileName: string | null;
  resumeStoragePath: string | null;
  resumeDownloadUrl: string | null;
  resumeTextAvailable: boolean;
  registeredLinks: string[];
  conversationStage: string | null;
  isOnboardingDone: boolean;
  lastConversationAt: string | null;
  createdAt: string | null;
  insights: Record<string, string> | null;
  mergedChecklist: MergedChecklistItem[];
  structuredProfile: {
    experiences: unknown[];
    educations: unknown[];
    extras: unknown[];
  } | null;
  preferences: {
    engagementTypes: string[];
    preferredLocations: string[];
    careerMoveIntent: string | null;
    profileVisibility: string | null;
  } | null;
  messages: Array<{
    id: number;
    role: string;
    content: string;
    messageType: string | null;
    createdAt: string;
  }>;
};

export type CareerTalentProfileIngestResponse = {
  ok: true;
  ingestion: {
    linkedinUrl: string;
    stats: {
      experiencesFromLinkedin: number;
      educationsFromLinkedin: number;
      extrasFromLinkedin: number;
      experiencesFromLlm: number;
      educationsFromLlm: number;
      extrasFromLlm: number;
      experiencesSaved: number;
      educationsSaved: number;
      extrasSaved: number;
    };
    warnings: Array<{
      code: string;
      message: string;
      detail?: string | null;
    }>;
  };
};

export type CareerTalentMailRecipient = {
  email: string;
  name: string | null;
  userId: string;
};

export type CareerTalentMailHistoryItem = {
  bodyText: string | null;
  createdAt: string;
  createdBy: string | null;
  direction: "inbound" | "outbound";
  fromEmail: string | null;
  id: string;
  mailType: string;
  occurredAt: string;
  status: string;
  subject: string | null;
  toEmail: string | null;
};

type InternalCareerTalentMailHistoryItem = CareerTalentMailHistoryItem & {
  dedupeKeys: string[];
};

export type CareerTalentMailHistoryResponse = {
  messages: CareerTalentMailHistoryItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type CareerTalentMailSendResponse = {
  ok: true;
  historyId: string;
  recipientEmail: string;
  recipientName: string | null;
};

export type CareerTalentRecommendationSourceType = "internal" | "external";
export type CareerTalentRecommendationSourceFilter =
  | "all"
  | CareerTalentRecommendationSourceType;

export type CareerTalentRecommendationItem = {
  clickedAt: string | null;
  companyName: string;
  createdAt: string;
  effectiveStage: string;
  externalJdUrl: string | null;
  feedback: string | null;
  feedbackAt: string | null;
  feedbackReason: string | null;
  fitSummary: string | null;
  locationText: string | null;
  opportunityType: string;
  processedStage: string | null;
  rank: number | null;
  recommendationId: string;
  recommendationReasons: string[];
  recommendedAt: string;
  roleId: string;
  roleName: string;
  roleStatus: string | null;
  savedStage: string | null;
  score: number | null;
  sourceType: CareerTalentRecommendationSourceType;
  talentId: string;
  updatedAt: string;
  viewedAt: string | null;
};

export type CareerTalentRecommendationsResponse = {
  recommendations: CareerTalentRecommendationItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type CareerTalentRecommendationStageUpdateResponse = {
  ok: true;
  recommendationId: string;
  processedStage: string | null;
};

export type OpsInternalRecommendationAcceptedFilter = "all" | "accepted";

export type OpsInternalRecommendationTalent = {
  email: string | null;
  headline: string | null;
  name: string | null;
  profilePicture: string | null;
  userId: string;
};

export type OpsInternalRecommendationItem = CareerTalentRecommendationItem & {
  talent: OpsInternalRecommendationTalent;
};

export type OpsInternalRecommendationsResponse = {
  acceptedFilter: OpsInternalRecommendationAcceptedFilter;
  recommendations: OpsInternalRecommendationItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type OpsInternalRecommendationStageBulkUpdateResponse = {
  ok: true;
  updates: CareerTalentRecommendationStageUpdateResponse[];
};

export type OpsManualInternalRecommendationRole = {
  alreadyRecommended: boolean;
  companyName: string;
  companyWorkspaceId: string;
  description: string | null;
  descriptionSummary: string | null;
  locationText: string | null;
  roleId: string;
  roleName: string;
  status: string | null;
  updatedAt: string | null;
};

export type OpsManualInternalRecommendationRolesResponse = {
  roles: OpsManualInternalRecommendationRole[];
  limit: number;
  query: string;
};

export type OpsQueueManualInternalRecommendationResponse = {
  ok: true;
  run: {
    id: string;
    status: string;
    trigger: string;
  };
  role: OpsManualInternalRecommendationRole;
};

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const DEFAULT_MAIL_HISTORY_LIMIT = 10;
const MAX_MAIL_HISTORY_LIMIT = 50;
const MAX_MAIL_HISTORY_SOURCE_LIMIT = 1000;
const DEFAULT_RECOMMENDATION_LIMIT = 20;
const MAX_RECOMMENDATION_LIMIT = 50;
const DEFAULT_INTERNAL_RECOMMENDATION_LIMIT = 80;
const MAX_INTERNAL_RECOMMENDATION_LIMIT = 100;
const MAX_INTERNAL_RECOMMENDATION_UPDATE_COUNT = 100;
const MAX_PROCESSED_STAGE_LENGTH = 200;
const DEFAULT_MANUAL_INTERNAL_ROLE_LIMIT = 40;
const MAX_MANUAL_INTERNAL_ROLE_LIMIT = 80;
const MAX_MANUAL_INTERNAL_REASON_LENGTH = 2000;
const DEFAULT_CAREER_MAIL_FROM = "Harper <hello@matchharper.com>";

export function parseCareerListLimit(value: string | null) {
  const n = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

export function parseCareerListOffset(value: string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function parseCareerMailHistoryLimit(value: string | null) {
  const n = Number(value ?? DEFAULT_MAIL_HISTORY_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_MAIL_HISTORY_LIMIT;
  return Math.max(1, Math.min(MAX_MAIL_HISTORY_LIMIT, Math.floor(n)));
}

export function parseCareerMailHistoryOffset(value: string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function parseCareerRecommendationLimit(value: string | null) {
  const n = Number(value ?? DEFAULT_RECOMMENDATION_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_RECOMMENDATION_LIMIT;
  return Math.max(1, Math.min(MAX_RECOMMENDATION_LIMIT, Math.floor(n)));
}

export function parseCareerRecommendationOffset(value: string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function parseCareerRecommendationSourceFilter(
  value: string | null
): CareerTalentRecommendationSourceFilter {
  return value === "internal" || value === "external" ? value : "all";
}

export function parseOpsInternalRecommendationLimit(value: string | null) {
  const n = Number(value ?? DEFAULT_INTERNAL_RECOMMENDATION_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_INTERNAL_RECOMMENDATION_LIMIT;
  return Math.max(1, Math.min(MAX_INTERNAL_RECOMMENDATION_LIMIT, Math.floor(n)));
}

export function parseOpsInternalRecommendationOffset(value: string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function parseOpsInternalRecommendationAcceptedFilter(
  value: string | null
): OpsInternalRecommendationAcceptedFilter {
  return value === "accepted" ? "accepted" : "all";
}

function toUntypedAdmin(admin: TalentAdminClient) {
  return admin as unknown as UntypedAdminClient;
}

function getDefaultCareerMailFrom() {
  return (
    process.env.EMAIL_REPLY_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    DEFAULT_CAREER_MAIL_FROM
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getJsonString(value: unknown, key: string) {
  const raw = asRecord(value)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function getFirstRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function coerceUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeTextList(value: unknown, limit = 5): string[] {
  return coerceUnknownArray(value)
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const text =
          typeof record.text === "string"
            ? record.text
            : typeof record.reason === "string"
              ? record.reason
              : typeof record.title === "string"
                ? record.title
                : "";
        return text.trim();
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeCareerSummaryText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizeCareerLinkHref(link: string) {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function getRegisteredLinkType(
  link: string
): CareerTalentRegisteredLinkType | null {
  const normalized = normalizeCareerSummaryText(link);
  if (!normalized) return null;

  try {
    const url = new URL(normalizeCareerLinkHref(normalized));
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
      return "linkedin";
    }
    if (host === "github.com" || host.endsWith(".github.com")) {
      return "github";
    }
  } catch {
    if (/linkedin\.com/i.test(normalized)) return "linkedin";
    if (/github\.com/i.test(normalized)) return "github";
  }

  return "other";
}

function getRegisteredLinkTypes(value: unknown) {
  if (!Array.isArray(value)) return [];

  const types: CareerTalentRegisteredLinkType[] = [];
  for (const link of value) {
    if (typeof link !== "string") continue;
    const type = getRegisteredLinkType(link);
    if (type && !types.includes(type)) {
      types.push(type);
    }
  }
  return types;
}

function isCurrentTalentExperience(
  row: Pick<TalentExperienceRow, "end_date">
) {
  const endDate = normalizeCareerSummaryText(row.end_date);
  return (
    !endDate ||
    /^(present|current|now|ongoing|재직|현재)$/i.test(endDate) ||
    /present|current|ongoing|재직|현재/i.test(endDate)
  );
}

function normalizeManualInternalRoleLimit(value: number | undefined) {
  const n = Number(value ?? DEFAULT_MANUAL_INTERNAL_ROLE_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_MANUAL_INTERNAL_ROLE_LIMIT;
  return Math.max(1, Math.min(MAX_MANUAL_INTERNAL_ROLE_LIMIT, Math.floor(n)));
}

function normalizeRoleSearchText(value: unknown) {
  return String(value ?? "").trim().slice(0, 160);
}

function normalizeManualReason(value: unknown) {
  const reason = String(value ?? "").trim();
  if (!reason) return "";
  return reason.slice(0, MAX_MANUAL_INTERNAL_REASON_LENGTH);
}

function isMissingCareerEmailMessagesError(error: unknown) {
  const row = asRecord(error);
  const code = typeof row.code === "string" ? row.code : "";
  const message = typeof row.message === "string" ? row.message : "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (message.includes("career_email_messages") &&
      (message.includes("schema cache") || message.includes("does not exist")))
  );
}

function getOccurredAt(item: {
  createdAt?: string | null;
  occurredAt?: string | null;
  receivedAt?: string | null;
  sentAt?: string | null;
}) {
  return (
    item.occurredAt ||
    item.sentAt ||
    item.receivedAt ||
    item.createdAt ||
    new Date(0).toISOString()
  );
}

function compareMailHistoryItems(
  a: InternalCareerTalentMailHistoryItem,
  b: InternalCareerTalentMailHistoryItem
) {
  const aTime = Date.parse(a.occurredAt);
  const bTime = Date.parse(b.occurredAt);
  const safeATime = Number.isFinite(aTime) ? aTime : 0;
  const safeBTime = Number.isFinite(bTime) ? bTime : 0;
  if (safeATime !== safeBTime) return safeBTime - safeATime;
  return b.id.localeCompare(a.id);
}

function compactDedupeKeys(keys: Array<string | null | undefined>) {
  return Array.from(
    new Set(keys.map((key) => key?.trim()).filter(Boolean) as string[])
  );
}

function publicMailItemFromInternal(
  item: InternalCareerTalentMailHistoryItem
): CareerTalentMailHistoryItem {
  const { dedupeKeys: _dedupeKeys, ...publicItem } = item;
  return publicItem;
}

function parseStoredMailMessage(content: string) {
  const lines = content.split(/\r?\n/);
  const subjectLine = lines.find((line) => line.startsWith("Email subject:"));
  const fromLine = lines.find((line) => line.startsWith("From:"));
  const toLine = lines.find((line) => line.startsWith("To:"));
  const bodyStartIndex = lines.findIndex((line, index) => {
    return (
      line.trim() === "" &&
      lines.slice(0, index).some((candidate) => candidate.startsWith("To:"))
    );
  });
  return {
    bodyText:
      bodyStartIndex >= 0
        ? lines
            .slice(bodyStartIndex + 1)
            .join("\n")
            .trim() || null
        : content.trim() || null,
    fromEmail: fromLine?.slice("From:".length).trim() || null,
    subject: subjectLine?.slice("Email subject:".length).trim() || null,
    toEmail: toLine?.slice("To:".length).trim() || null,
  };
}

function buildStoredMailMessage(args: {
  bodyText: string;
  fromEmail: string;
  subject: string;
  toEmail: string;
}) {
  return [
    `Email subject: ${args.subject}`,
    `From: ${args.fromEmail}`,
    `To: ${args.toEmail}`,
    "",
    args.bodyText,
  ].join("\n");
}

async function createCareerEmailMessage(args: {
  admin: UntypedAdminClient;
  payload: CareerEmailMessageInsert;
}) {
  const { error } = await args.admin
    .from("career_email_messages")
    .insert(args.payload);
  if (!error) {
    return true;
  }
  console.warn("[ops-career-mail] email history insert skipped", {
    error: error.message,
    missingTable: isMissingCareerEmailMessagesError(error),
  });
  return false;
}

async function updateCareerEmailMessage(args: {
  admin: UntypedAdminClient;
  id: string;
  payload: CareerEmailMessageUpdate;
}) {
  const { error } = await args.admin
    .from("career_email_messages")
    .update(args.payload)
    .eq("id", args.id);
  if (!error) {
    return true;
  }
  console.warn("[ops-career-mail] email history update skipped", {
    error: error.message,
    historyId: args.id,
    missingTable: isMissingCareerEmailMessagesError(error),
  });
  return false;
}

async function fetchMailItemsSafely(
  label: string,
  load: () => Promise<InternalCareerTalentMailHistoryItem[]>
) {
  try {
    return await load();
  } catch (error) {
    console.warn("[ops-career-mail] history source skipped", {
      error: error instanceof Error ? error.message : String(error),
      source: label,
    });
    return [];
  }
}

function firstOnboardingSubject(displayName: string | null | undefined) {
  const name = displayName?.trim();
  return name ? `From Harper to ${name}` : "Harper에서 먼저 인사드려요";
}

function reviewOnboardingSubject(displayName: string | null | undefined) {
  const name = displayName?.trim();
  return `${name ? `${name}님, ` : ""}자료 확인했습니다`;
}

export async function fetchCareerTalentList(args: {
  limit?: number;
  offset?: number;
}): Promise<CareerTalentListResponse> {
  const limit = Math.max(1, Math.min(MAX_LIMIT, args.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, args.offset ?? 0);
  const admin = getTalentSupabaseAdmin();

  // Fetch talent_users who have conversations (career onboarded)
  const {
    data: talentUsers,
    error: talentError,
    count,
  } = await admin
    .from("talent_users")
    .select(
      "user_id, name, email, profile_picture, headline, resume_file_name, resume_storage_path, resume_links, created_at",
      {
        count: "exact",
      }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (talentError) {
    throw new Error(talentError.message ?? "Failed to load talent users");
  }

  const rows = (talentUsers ?? []) as Pick<
    TalentUserRow,
    | "user_id"
    | "name"
    | "email"
    | "profile_picture"
    | "headline"
    | "resume_file_name"
    | "resume_storage_path"
    | "resume_links"
    | "created_at"
  >[];
  const totalCount = count ?? 0;

  if (rows.length === 0) {
    return {
      talents: [],
      totalCount,
      limit,
      offset,
      hasMore: false,
      nextOffset: null,
    };
  }

  const userIds = rows.map((r) => r.user_id);

  const { data: experienceRows } = await admin
    .from("talent_experiences")
    .select("id, talent_id, company_name, role, start_date, end_date")
    .in("talent_id", userIds)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  const currentExperienceMap = new Map<
    string,
    { companyName: string | null; role: string | null }
  >();
  for (const experience of (experienceRows ?? []) as Pick<
    TalentExperienceRow,
    "id" | "talent_id" | "company_name" | "role" | "start_date" | "end_date"
  >[]) {
    if (currentExperienceMap.has(experience.talent_id)) continue;
    if (!isCurrentTalentExperience(experience)) continue;

    const companyName = normalizeCareerSummaryText(experience.company_name);
    const role = normalizeCareerSummaryText(experience.role);
    if (!companyName && !role) continue;

    currentExperienceMap.set(experience.talent_id, {
      companyName,
      role,
    });
  }

  // Fetch latest conversation per user
  const { data: conversations } = await admin
    .from("talent_conversations")
    .select("user_id, stage, updated_at")
    .in("user_id", userIds)
    .order("updated_at", { ascending: false });

  const conversationMap = new Map<
    string,
    Pick<TalentConversationRow, "stage" | "updated_at">
  >();
  for (const conv of conversations ?? []) {
    if (!conversationMap.has(conv.user_id)) {
      conversationMap.set(conv.user_id, conv);
    }
  }

  // Fetch onboarding completion status per user.
  const { data: settingsRows } = await admin
    .from("talent_setting")
    .select("user_id, is_onboarding_done")
    .in("user_id", userIds);

  const onboardingDoneMap = new Map<string, boolean>();
  for (const setting of settingsRows ?? []) {
    onboardingDoneMap.set(setting.user_id, Boolean(setting.is_onboarding_done));
  }

  // Fetch insights per user
  const { data: insightsRows } = await admin
    .from("talent_insights")
    .select("talent_id, content")
    .in("talent_id", userIds);

  const insightsMap = new Map<string, Record<string, string>>();
  for (const row of insightsRows ?? []) {
    const normalized = normalizeTalentInsightContent(row.content);
    if (normalized && row.talent_id) {
      insightsMap.set(row.talent_id, normalized);
    }
  }

  const talents: CareerTalentSummary[] = rows.map((row) => {
    const conv = conversationMap.get(row.user_id);
    const insights = insightsMap.get(row.user_id);
    const insightCount = insights ? Object.keys(insights).length : 0;
    const currentExperience = currentExperienceMap.get(row.user_id);
    const registeredLinkTypes = getRegisteredLinkTypes(row.resume_links);

    return {
      userId: row.user_id,
      name: row.name,
      email: row.email,
      profilePicture: row.profile_picture,
      headline: row.headline,
      currentCompanyName: currentExperience?.companyName ?? null,
      currentRole: currentExperience?.role ?? null,
      registeredLinkTypes,
      hasRegisteredLink: registeredLinkTypes.length > 0,
      hasResume: Boolean(
        normalizeCareerSummaryText(row.resume_file_name) ||
          normalizeCareerSummaryText(row.resume_storage_path)
      ),
      conversationStage: conv?.stage ?? null,
      isOnboardingDone: onboardingDoneMap.get(row.user_id) ?? false,
      insightCoverage: insightCount,
      lastConversationAt: conv?.updated_at ?? null,
      createdAt: row.created_at,
    };
  });

  const nextOffset =
    offset + talents.length < totalCount ? offset + talents.length : null;

  return {
    talents,
    totalCount,
    limit,
    offset,
    hasMore: nextOffset !== null,
    nextOffset,
  };
}

export async function fetchCareerTalentDetail(
  userId: string
): Promise<CareerTalentDetailResponse> {
  const admin = getTalentSupabaseAdmin();

  const [profile, insights, structuredProfile, mergedChecklist] =
    await Promise.all([
      fetchTalentUserProfile({ admin, userId }),
      fetchTalentInsights({ admin, userId }),
      fetchTalentStructuredProfile({ admin, userId, talentUser: null }),
      getMergedChecklist({ admin }),
    ]);

  // Fetch latest conversation
  const { data: conversations } = await admin
    .from("talent_conversations")
    .select("id, stage, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const latestConv = conversations?.[0] ?? null;

  // Fetch messages from latest conversation
  let messages: CareerTalentDetailResponse["messages"] = [];
  if (latestConv) {
    const { data: messageRows } = await admin
      .from("talent_messages")
      .select("id, role, content, message_type, created_at")
      .eq("conversation_id", latestConv.id)
      .order("created_at", { ascending: true })
      .limit(100);

    messages = (messageRows ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      messageType: m.message_type,
      createdAt: m.created_at,
    }));
  }

  // Fetch preferences
  const { data: setting } = await admin
    .from("talent_setting")
    .select(
      "engagement_types, career_move_intent, profile_visibility, is_onboarding_done"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const normalizedInsights = normalizeTalentInsightContent(insights?.content);
  const resumeFileName = profile?.resume_file_name?.trim() || null;
  const resumeStoragePath = profile?.resume_storage_path?.trim() || null;
  const resumeDownloadUrl = await getTalentResumeSignedUrl({
    admin,
    storagePath: resumeStoragePath,
  });

  return {
    userId,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    profilePicture: profile?.profile_picture ?? null,
    headline: profile?.headline ?? null,
    bio: profile?.bio ?? null,
    location: profile?.location ?? null,
    resumeFileName,
    resumeStoragePath,
    resumeDownloadUrl,
    resumeTextAvailable: Boolean(profile?.resume_text?.trim()),
    registeredLinks: profile?.resume_links ?? [],
    conversationStage: latestConv?.stage ?? null,
    isOnboardingDone: Boolean(setting?.is_onboarding_done),
    lastConversationAt: latestConv?.updated_at ?? null,
    createdAt: profile?.created_at ?? null,
    insights: normalizedInsights,
    mergedChecklist,
    structuredProfile: structuredProfile
      ? {
          experiences: structuredProfile.talentExperiences ?? [],
          educations: structuredProfile.talentEducations ?? [],
          extras: structuredProfile.talentExtras ?? [],
        }
      : null,
    preferences: setting
      ? {
          engagementTypes: (setting.engagement_types as string[]) ?? [],
          preferredLocations: [],
          careerMoveIntent: (setting.career_move_intent as string) ?? null,
          profileVisibility: (setting.profile_visibility as string) ?? null,
        }
      : null,
    messages,
  };
}

type CareerRecommendationRoleRow = {
  external_jd_url?: string | null;
  location_text?: string | null;
  name?: string | null;
  role_id?: string | null;
  source_type?: string | null;
  status?: string | null;
  company_workspace?:
    | {
        company_name?: string | null;
      }
    | Array<{
        company_name?: string | null;
      }>
    | null;
};

type CareerRecommendationRow = {
  clicked_at?: string | null;
  company_role?:
    | CareerRecommendationRoleRow
    | CareerRecommendationRoleRow[]
    | null;
  created_at?: string | null;
  feedback?: string | null;
  feedback_at?: string | null;
  feedback_reason?: string | null;
  fit_reasons?: unknown;
  fit_summary?: string | null;
  id?: string | null;
  opportunity_type?: string | null;
  processed_stage?: string | null;
  rank?: number | null;
  recommended_at?: string | null;
  role_id?: string | null;
  saved_stage?: string | null;
  score?: number | null;
  talent_id?: string | null;
  updated_at?: string | null;
  viewed_at?: string | null;
};

type InternalRecommendationTalentRow = {
  email?: string | null;
  headline?: string | null;
  name?: string | null;
  profile_picture?: string | null;
  user_id?: string | null;
};

type CareerRecommendationStageLookupRow = {
  company_role?:
    | {
        source_type?: string | null;
      }
    | Array<{
        source_type?: string | null;
      }>
    | null;
  opportunity_type?: string | null;
};

function normalizeRecommendationSourceType(args: {
  opportunityType?: string | null;
  roleSourceType?: string | null;
}): CareerTalentRecommendationSourceType {
  const roleSourceType = String(args.roleSourceType ?? "").toLowerCase();
  const opportunityType = String(args.opportunityType ?? "").toLowerCase();
  if (
    roleSourceType === "internal" ||
    opportunityType === "internal_recommendation" ||
    opportunityType === "intro_request"
  ) {
    return "internal";
  }
  return "external";
}

function getEffectiveRecommendationStage(row: {
  feedback?: string | null;
  processed_stage?: string | null;
}) {
  const processedStage = row.processed_stage?.trim();
  if (processedStage) return processedStage;
  return row.feedback?.trim() ? "수락-거절함" : "추천됨";
}

function mapCareerRecommendationRow(
  row: CareerRecommendationRow
): CareerTalentRecommendationItem | null {
  const role = getFirstRecord(row.company_role);
  if (!role) return null;

  const workspace = getFirstRecord(role.company_workspace);
  const recommendationId = String(row.id ?? "").trim();
  const roleId = String(row.role_id ?? role.role_id ?? "").trim();
  const talentId = String(row.talent_id ?? "").trim();
  if (!recommendationId || !roleId) return null;

  const opportunityType = String(row.opportunity_type ?? "external_jd");
  const processedStage = row.processed_stage?.trim() || null;
  const recommendedAt =
    row.recommended_at ?? row.created_at ?? new Date(0).toISOString();
  const createdAt = row.created_at ?? recommendedAt;
  const updatedAt = row.updated_at ?? createdAt;

  return {
    clickedAt: row.clicked_at ?? null,
    companyName: String(workspace?.company_name ?? "회사명 없음"),
    createdAt,
    effectiveStage: getEffectiveRecommendationStage(row),
    externalJdUrl: role.external_jd_url ?? null,
    feedback: row.feedback ?? null,
    feedbackAt: row.feedback_at ?? null,
    feedbackReason: row.feedback_reason ?? null,
    fitSummary: row.fit_summary ?? null,
    locationText: role.location_text ?? null,
    opportunityType,
    processedStage,
    rank: typeof row.rank === "number" ? row.rank : null,
    recommendationId,
    recommendationReasons: normalizeTextList(row.fit_reasons),
    recommendedAt,
    roleId,
    roleName: String(role.name ?? "역할명 없음"),
    roleStatus: role.status ?? null,
    savedStage: row.saved_stage ?? null,
    score: typeof row.score === "number" ? row.score : null,
    sourceType: normalizeRecommendationSourceType({
      opportunityType,
      roleSourceType: role.source_type ?? null,
    }),
    talentId,
    updatedAt,
    viewedAt: row.viewed_at ?? null,
  };
}

const CAREER_RECOMMENDATION_SELECT = `
  id,
  talent_id,
  role_id,
  opportunity_type,
  processed_stage,
  feedback,
  feedback_at,
  feedback_reason,
  saved_stage,
  viewed_at,
  clicked_at,
  recommended_at,
  created_at,
  updated_at,
  fit_reasons,
  fit_summary,
  rank,
  score,
  company_role:company_roles (
    role_id,
    name,
    external_jd_url,
    location_text,
    source_type,
    status,
    company_workspace:company_workspace (
      company_name
    )
  )
`;

async function loadCareerRecommendationRows(args: {
  admin: UntypedAdminClient;
  limit: number;
  offset: number;
  userId?: string | null;
}): Promise<CareerRecommendationRow[]> {
  let query = args.admin
    .from("talent_opportunity_recommendation")
    .select(CAREER_RECOMMENDATION_SELECT)
    .order("recommended_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(args.offset, args.offset + args.limit);

  if (args.userId) {
    query = query.eq("talent_id", args.userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message ?? "Failed to load recommendations");
  }

  return (Array.isArray(data) ? data : []) as CareerRecommendationRow[];
}

async function fetchFilteredCareerTalentRecommendations(args: {
  admin: UntypedAdminClient;
  filter: CareerTalentRecommendationSourceType;
  limit: number;
  offset: number;
  userId: string;
}): Promise<CareerTalentRecommendationItem[]> {
  const collected: CareerTalentRecommendationItem[] = [];
  let filteredSeen = 0;
  let scanOffset = 0;
  let hasUnscannedRows = true;

  while (collected.length <= args.limit && hasUnscannedRows) {
    const rows = await loadCareerRecommendationRows({
      admin: args.admin,
      limit: MAX_RECOMMENDATION_LIMIT,
      offset: scanOffset,
      userId: args.userId,
    });
    hasUnscannedRows = rows.length > MAX_RECOMMENDATION_LIMIT;

    for (const row of rows.slice(0, MAX_RECOMMENDATION_LIMIT)) {
      const item = mapCareerRecommendationRow(row);
      if (!item || item.sourceType !== args.filter) continue;

      if (filteredSeen < args.offset) {
        filteredSeen += 1;
        continue;
      }

      collected.push(item);
      if (collected.length > args.limit) break;
    }

    scanOffset += MAX_RECOMMENDATION_LIMIT;
  }

  return collected;
}

export async function fetchCareerTalentRecommendations(args: {
  limit?: number;
  offset?: number;
  sourceType?: CareerTalentRecommendationSourceFilter;
  userId: string;
}): Promise<CareerTalentRecommendationsResponse> {
  const limit = Math.max(
    1,
    Math.min(
      MAX_RECOMMENDATION_LIMIT,
      args.limit ?? DEFAULT_RECOMMENDATION_LIMIT
    )
  );
  const offset = Math.max(0, args.offset ?? 0);
  const userId = String(args.userId ?? "").trim();
  if (!userId) {
    throw new Error("userId is required");
  }

  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const sourceType = args.sourceType ?? "all";
  if (sourceType === "all") {
    const rows = await loadCareerRecommendationRows({
      admin,
      limit,
      offset,
      userId,
    });
    const hasMore = rows.length > limit;
    const recommendations = rows
      .slice(0, limit)
      .map(mapCareerRecommendationRow)
      .filter((item): item is CareerTalentRecommendationItem => item !== null);

    return {
      recommendations,
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  const filteredItems = await fetchFilteredCareerTalentRecommendations({
    admin,
    filter: sourceType,
    limit,
    offset,
    userId,
  });
  const hasMore = filteredItems.length > limit;
  const recommendations = filteredItems.slice(0, limit);

  return {
    recommendations,
    limit,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

export async function updateCareerTalentRecommendationProcessedStage(args: {
  processedStage: string | null;
  recommendationId: string;
}): Promise<CareerTalentRecommendationStageUpdateResponse> {
  const recommendationId = String(args.recommendationId ?? "").trim();
  if (!recommendationId) {
    throw new Error("recommendationId is required");
  }

  const processedStage =
    typeof args.processedStage === "string"
      ? args.processedStage.trim()
      : null;
  if (processedStage && processedStage.length > MAX_PROCESSED_STAGE_LENGTH) {
    throw new Error(
      `processedStage must be ${MAX_PROCESSED_STAGE_LENGTH} characters or fewer`
    );
  }

  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const { data: existing, error: existingError } = await admin
    .from("talent_opportunity_recommendation")
    .select(
      `
        id,
        opportunity_type,
        company_role:company_roles (
          source_type
        )
      `
    )
    .eq("id", recommendationId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      existingError.message ?? "Failed to load recommendation stage"
    );
  }
  if (!existing) {
    throw new Error("Recommendation not found");
  }

  const lookupRow = existing as CareerRecommendationStageLookupRow;
  const role = getFirstRecord(lookupRow.company_role);
  const sourceType = normalizeRecommendationSourceType({
    opportunityType: lookupRow.opportunity_type,
    roleSourceType: role?.source_type ?? null,
  });
  if (sourceType !== "internal") {
    throw new Error("Only internal recommendations can update processedStage");
  }

  const normalizedStage = processedStage || null;
  const { error } = await admin
    .from("talent_opportunity_recommendation")
    .update({
      processed_stage: normalizedStage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recommendationId);

  if (error) {
    throw new Error(error.message ?? "Failed to update recommendation stage");
  }

  return {
    ok: true,
    recommendationId,
    processedStage: normalizedStage,
  };
}

function isAcceptedRecommendationFeedback(feedback: string | null | undefined) {
  const normalized = String(feedback ?? "").trim().toLowerCase();
  return normalized === "like" || normalized === "positive";
}

async function fetchInternalRecommendationTalentMap(
  admin: UntypedAdminClient,
  talentIds: string[]
) {
  const uniqueTalentIds = Array.from(
    new Set(talentIds.map((value) => value.trim()).filter(Boolean))
  );
  const byTalentId = new Map<string, OpsInternalRecommendationTalent>();
  if (uniqueTalentIds.length === 0) return byTalentId;

  const { data, error } = await admin
    .from("talent_users")
    .select("user_id, name, email, profile_picture, headline")
    .in("user_id", uniqueTalentIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load recommendation talents");
  }

  for (const row of (Array.isArray(data)
    ? data
    : []) as InternalRecommendationTalentRow[]) {
    const userId = String(row.user_id ?? "").trim();
    if (!userId) continue;
    byTalentId.set(userId, {
      email: row.email ?? null,
      headline: row.headline ?? null,
      name: row.name ?? null,
      profilePicture: row.profile_picture ?? null,
      userId,
    });
  }

  return byTalentId;
}

export async function fetchOpsInternalRecommendations(args: {
  acceptedFilter?: OpsInternalRecommendationAcceptedFilter;
  limit?: number;
  offset?: number;
}): Promise<OpsInternalRecommendationsResponse> {
  const limit = Math.max(
    1,
    Math.min(
      MAX_INTERNAL_RECOMMENDATION_LIMIT,
      args.limit ?? DEFAULT_INTERNAL_RECOMMENDATION_LIMIT
    )
  );
  const offset = Math.max(0, args.offset ?? 0);
  const acceptedFilter = args.acceptedFilter ?? "all";
  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const collected: CareerTalentRecommendationItem[] = [];
  let filteredSeen = 0;
  let scanOffset = 0;
  let hasUnscannedRows = true;

  while (collected.length <= limit && hasUnscannedRows) {
    const rows = await loadCareerRecommendationRows({
      admin,
      limit: MAX_INTERNAL_RECOMMENDATION_LIMIT,
      offset: scanOffset,
    });
    hasUnscannedRows = rows.length > MAX_INTERNAL_RECOMMENDATION_LIMIT;

    for (const row of rows.slice(0, MAX_INTERNAL_RECOMMENDATION_LIMIT)) {
      const item = mapCareerRecommendationRow(row);
      if (!item || item.sourceType !== "internal" || !item.talentId) continue;
      if (
        acceptedFilter === "accepted" &&
        !isAcceptedRecommendationFeedback(item.feedback)
      ) {
        continue;
      }

      if (filteredSeen < offset) {
        filteredSeen += 1;
        continue;
      }

      collected.push(item);
      if (collected.length > limit) break;
    }

    scanOffset += MAX_INTERNAL_RECOMMENDATION_LIMIT;
  }

  const hasMore = collected.length > limit;
  const pageItems = collected.slice(0, limit);
  const talentMap = await fetchInternalRecommendationTalentMap(
    admin,
    pageItems.map((item) => item.talentId)
  );

  return {
    acceptedFilter,
    recommendations: pageItems.map((item) => ({
      ...item,
      talent: talentMap.get(item.talentId) ?? {
        email: null,
        headline: null,
        name: null,
        profilePicture: null,
        userId: item.talentId,
      },
    })),
    limit,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

export async function updateOpsInternalRecommendationProcessedStages(args: {
  updates: Array<{
    processedStage: string | null;
    recommendationId: string;
  }>;
}): Promise<OpsInternalRecommendationStageBulkUpdateResponse> {
  const updatesById = new Map<
    string,
    { processedStage: string | null; recommendationId: string }
  >();

  for (const update of args.updates) {
    const recommendationId = String(update.recommendationId ?? "").trim();
    if (!recommendationId) continue;
    updatesById.set(recommendationId, {
      recommendationId,
      processedStage:
        typeof update.processedStage === "string"
          ? update.processedStage.trim()
          : null,
    });
  }

  const updates = Array.from(updatesById.values());
  if (updates.length === 0) {
    throw new Error("updates is required");
  }
  if (updates.length > MAX_INTERNAL_RECOMMENDATION_UPDATE_COUNT) {
    throw new Error(
      `updates must include ${MAX_INTERNAL_RECOMMENDATION_UPDATE_COUNT} items or fewer`
    );
  }

  const results: CareerTalentRecommendationStageUpdateResponse[] = [];
  for (const update of updates) {
    results.push(await updateCareerTalentRecommendationProcessedStage(update));
  }

  return {
    ok: true,
    updates: results,
  };
}

type ManualInternalRoleRow = {
  company_workspace?:
    | {
        company_name?: string | null;
        company_workspace_id?: string | null;
      }
    | Array<{
        company_name?: string | null;
        company_workspace_id?: string | null;
      }>
    | null;
  company_workspace_id?: string | null;
  description?: string | null;
  description_summary?: string | null;
  location_text?: string | null;
  name?: string | null;
  role_id?: string | null;
  source_type?: string | null;
  status?: string | null;
  updated_at?: string | null;
};

function mapManualInternalRoleRow(
  row: ManualInternalRoleRow
): OpsManualInternalRecommendationRole | null {
  const workspace = getFirstRecord(row.company_workspace);
  const roleId = String(row.role_id ?? "").trim();
  const roleName = String(row.name ?? "").trim();
  const companyWorkspaceId = String(
    row.company_workspace_id ?? workspace?.company_workspace_id ?? ""
  ).trim();
  const companyName = String(workspace?.company_name ?? "").trim();
  const roleSourceType = String(row.source_type ?? "").trim().toLowerCase();
  const status = String(row.status ?? "").trim().toLowerCase();
  const isActive = status === "active" || status === "top_priority";
  if (!roleId || !roleName || !companyWorkspaceId) return null;
  if (roleSourceType !== "internal") return null;
  if (!isActive) return null;

  return {
    alreadyRecommended: false,
    companyName: companyName || "회사명 없음",
    companyWorkspaceId,
    description: row.description ?? null,
    descriptionSummary: row.description_summary ?? null,
    locationText: row.location_text ?? null,
    roleId,
    roleName,
    status: row.status ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function roleMatchesManualSearch(
  role: OpsManualInternalRecommendationRole,
  query: string
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    role.roleName,
    role.companyName,
    role.locationText ?? "",
    role.status ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

async function loadManualInternalRoleRows(args: {
  admin: UntypedAdminClient;
  limit: number;
}): Promise<ManualInternalRoleRow[]> {
  const select = `
    role_id,
    company_workspace_id,
    name,
    description,
    description_summary,
    location_text,
    status,
    source_type,
    updated_at,
    company_workspace:company_workspace!inner (
      company_workspace_id,
      company_name
    )
  `;
  const sourceLimit = Math.max(120, Math.min(args.limit * 8, 600));

  const { data, error } = await args.admin
    .from("company_roles")
    .select(select)
    .eq("source_type", "internal")
    .in("status", ["active", "top_priority"])
    .order("updated_at", { ascending: false })
    .limit(sourceLimit);

  if (error) {
    throw new Error(error.message ?? "Failed to load internal roles");
  }

  return (data ?? []) as ManualInternalRoleRow[];
}

async function loadManualInternalRoleById(args: {
  admin: UntypedAdminClient;
  roleId: string;
}): Promise<OpsManualInternalRecommendationRole | null> {
  const { data, error } = await args.admin
    .from("company_roles")
    .select(
      `
        role_id,
        company_workspace_id,
        name,
        description,
        description_summary,
        location_text,
        status,
        source_type,
        updated_at,
        company_workspace:company_workspace (
          company_workspace_id,
          company_name
        )
      `
    )
    .eq("role_id", args.roleId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load internal role");
  }

  return data ? mapManualInternalRoleRow(data as ManualInternalRoleRow) : null;
}

export async function fetchManualInternalRecommendationRoles(args: {
  limit?: number;
  query?: string | null;
  userId?: string | null;
}): Promise<OpsManualInternalRecommendationRolesResponse> {
  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const limit = normalizeManualInternalRoleLimit(args.limit);
  const query = normalizeRoleSearchText(args.query);
  const userId = String(args.userId ?? "").trim();
  const rows = await loadManualInternalRoleRows({ admin, limit });
  const roles = rows
    .map(mapManualInternalRoleRow)
    .filter(
      (role): role is OpsManualInternalRecommendationRole => role !== null
    )
    .filter((role) => roleMatchesManualSearch(role, query))
    .slice(0, limit);
  const roleIds = roles.map((role) => role.roleId);
  const alreadyRecommendedRoleIds = new Set<string>();

  if (userId && roleIds.length > 0) {
    const { data, error } = await admin
      .from("talent_opportunity_recommendation")
      .select("role_id")
      .eq("talent_id", userId)
      .in("role_id", roleIds);

    if (error) {
      throw new Error(
        error.message ?? "Failed to load existing recommendations"
      );
    }

    for (const row of (data ?? []) as Array<{ role_id?: string | null }>) {
      const roleId = String(row.role_id ?? "").trim();
      if (roleId) alreadyRecommendedRoleIds.add(roleId);
    }
  }

  return {
    roles: roles.map((role) => ({
      ...role,
      alreadyRecommended: alreadyRecommendedRoleIds.has(role.roleId),
    })),
    limit,
    query,
  };
}

async function fetchLatestTalentConversationId(args: {
  admin: UntypedAdminClient;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_conversations")
    .select("id")
    .eq("user_id", args.userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent conversation");
  }

  return String(data?.[0]?.id ?? "").trim() || null;
}

export async function queueManualInternalRecommendationRun(args: {
  reason?: string | null;
  requestedBy?: string | null;
  roleId: string;
  userId: string;
}): Promise<OpsQueueManualInternalRecommendationResponse> {
  const userId = String(args.userId ?? "").trim();
  const roleId = String(args.roleId ?? "").trim();
  if (!userId) throw new Error("userId is required");
  if (!roleId) throw new Error("roleId is required");

  const admin = toUntypedAdmin(getTalentSupabaseAdmin());

  const [{ data: talent, error: talentError }, role] = await Promise.all([
    admin
      .from("talent_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    loadManualInternalRoleById({ admin, roleId }),
  ]);

  if (talentError) {
    throw new Error(talentError.message ?? "Failed to load talent user");
  }
  if (!talent) {
    throw new Error("Talent user was not found");
  }
  if (!role) {
    throw new Error("Active internal role was not found");
  }

  const reason = normalizeManualReason(args.reason);
  const conversationId = await fetchLatestTalentConversationId({
    admin,
    userId,
  });
  const requestedAt = new Date().toISOString();
  const run = await createOpportunityDiscoveryRun({
    admin,
    conversationId,
    runMode: "immediate",
    talentId: userId,
    trigger: "immediate_opportunity_requested",
    triggerPayload: {
      entryPoint: "ops_career_manual_internal_recommendation",
      opportunityAgentVariant: "new_rule",
      source: "ops_career_recommendations_tab",
      manualInternalRecommendation: {
        allowRepeat: true,
        companyName: role.companyName,
        reason: reason || null,
        requestedAt,
        requestedBy: String(args.requestedBy ?? "").trim() || null,
        roleId: role.roleId,
        roleName: role.roleName,
        source: "ops_career_recommendations_tab",
        type: "ops_manual_internal_role",
      },
      recommendationPolicy: {
        external: "none",
        internal: "forced_single_role",
      },
    },
  });

  await insertTalentActivityEvent({
    admin,
    changedDomains: ["opportunity_search", "recommendations"],
    conversationId,
    eventType: "ops_manual_internal_recommendation_queued",
    impactLevel: "high",
    metadata: {
      manualInternalRecommendation: {
        allowRepeat: true,
        companyName: role.companyName,
        reason: reason || null,
        requestedAt,
        requestedBy: String(args.requestedBy ?? "").trim() || null,
        roleId: role.roleId,
        roleName: role.roleName,
      },
      runId: run.id,
    },
    relatedEntityId: run.id,
    relatedEntityType: "opportunity_discovery_run",
    source: "ops",
    summary: `Ops queued a manual internal recommendation: ${role.roleName} at ${role.companyName}.`,
    userId,
  });

  return {
    ok: true,
    run: {
      id: run.id,
      status: run.status,
      trigger: run.trigger,
    },
    role,
  };
}

export async function fetchCareerTalentMailRecipient(
  userId: string
): Promise<CareerTalentMailRecipient> {
  const admin = getTalentSupabaseAdmin();
  const { data, error } = await admin
    .from("talent_users")
    .select("user_id, name, email")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load talent recipient");
  }
  if (!data) {
    throw new Error("Talent user was not found");
  }

  const email = String(data.email ?? "").trim();
  if (!email) {
    throw new Error("Talent user does not have an email address");
  }

  return {
    email,
    name: data.name ?? null,
    userId: data.user_id,
  };
}

async function fetchLatestCareerConversationId(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_conversations")
    .select("id")
    .eq("user_id", args.userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent conversation");
  }

  return data?.[0]?.id ?? null;
}

async function ensureCareerTalentConversation(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const existingId = await fetchLatestCareerConversationId(args);
  if (existingId) return existingId;

  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("talent_conversations")
    .insert({
      created_at: now,
      relief_nudge_sent: false,
      stage: "chat",
      updated_at: now,
      user_id: args.userId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to create talent conversation");
  }

  return data.id;
}

function canonicalMailItemFromRow(
  row: any
): InternalCareerTalentMailHistoryItem {
  const direction = row.direction === "inbound" ? "inbound" : "outbound";
  const mailType = String(row.mail_type ?? "other");
  const occurredAt =
    typeof row.occurred_at === "string" ? row.occurred_at : null;
  const createdAt =
    typeof row.created_at === "string"
      ? row.created_at
      : new Date(0).toISOString();

  return {
    bodyText: typeof row.body_text === "string" ? row.body_text : null,
    createdAt,
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    direction,
    dedupeKeys: compactDedupeKeys([
      row.talent_message_id ? `talent-message:${row.talent_message_id}` : null,
      row.inbound_event_id ? `inbound-event:${row.inbound_event_id}` : null,
      row.reply_job_id ? `reply-job:${row.reply_job_id}:${mailType}` : null,
      getJsonString(row.metadata, "discoveryRunId")
        ? `opportunity-discovery-run:${getJsonString(
            row.metadata,
            "discoveryRunId"
          )}`
        : null,
    ]),
    fromEmail: typeof row.from_email === "string" ? row.from_email : null,
    id: `career-email-message:${row.id}`,
    mailType,
    occurredAt: getOccurredAt({ createdAt, occurredAt }),
    status: typeof row.status === "string" ? row.status : "sent",
    subject: typeof row.subject === "string" ? row.subject : null,
    toEmail: typeof row.to_email === "string" ? row.to_email : null,
  };
}

async function fetchCanonicalMailItems(args: {
  admin: UntypedAdminClient;
  sourceLimit: number;
  userId: string;
}): Promise<InternalCareerTalentMailHistoryItem[]> {
  const { data, error } = await args.admin
    .from("career_email_messages")
    .select(
      "id, talent_message_id, inbound_event_id, reply_job_id, direction, mail_type, status, subject, from_email, to_email, body_text, created_by, occurred_at, created_at, metadata"
    )
    .eq("talent_id", args.userId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, args.sourceLimit - 1);

  if (error) {
    if (isMissingCareerEmailMessagesError(error)) {
      return [];
    }
    throw new Error(error.message ?? "Failed to load career email messages");
  }

  return (data ?? []).map(canonicalMailItemFromRow);
}

async function fetchEmailReplyJobMailItems(args: {
  admin: UntypedAdminClient;
  sourceLimit: number;
  userId: string;
}): Promise<InternalCareerTalentMailHistoryItem[]> {
  const { data: jobs, error: jobsError } = await args.admin
    .from("email_reply_jobs")
    .select(
      "id, inbound_event_id, conversation_id, user_message_id, assistant_message_id, status, resend_email_id, processed_at, created_at, updated_at"
    )
    .eq("talent_id", args.userId)
    .order("created_at", { ascending: false })
    .range(0, args.sourceLimit - 1);

  if (jobsError) {
    throw new Error(jobsError.message ?? "Failed to load email reply jobs");
  }

  const jobRows = jobs ?? [];
  if (jobRows.length === 0) return [];

  const inboundIds = Array.from(
    new Set(jobRows.map((row: any) => row.inbound_event_id).filter(Boolean))
  );
  const messageIds = Array.from(
    new Set(
      jobRows
        .flatMap((row: any) => [row.user_message_id, row.assistant_message_id])
        .filter(Boolean)
    )
  );

  const [inboundResult, messageResult] = await Promise.all([
    inboundIds.length > 0
      ? args.admin
          .from("email_inbound_events")
          .select(
            "id, from_email, to_addresses, subject, received_at, created_at"
          )
          .in("id", inboundIds)
      : Promise.resolve({ data: [], error: null }),
    messageIds.length > 0
      ? args.admin
          .from("talent_messages")
          .select("id, content, created_at")
          .eq("user_id", args.userId)
          .in("id", messageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (inboundResult.error) {
    throw new Error(
      inboundResult.error.message ?? "Failed to load inbound email events"
    );
  }
  if (messageResult.error) {
    throw new Error(
      messageResult.error.message ?? "Failed to load email talent messages"
    );
  }

  const inboundById = new Map<string, any>(
    (inboundResult.data ?? []).map((row: any) => [String(row.id), row])
  );
  const messageById = new Map<number, any>(
    (messageResult.data ?? []).map((row: any) => [Number(row.id), row])
  );
  const fromEmail = getDefaultCareerMailFrom();
  const items: InternalCareerTalentMailHistoryItem[] = [];

  for (const job of jobRows) {
    const inbound = inboundById.get(String(job.inbound_event_id));
    const userMessage = job.user_message_id
      ? messageById.get(Number(job.user_message_id))
      : null;
    const assistantMessage = job.assistant_message_id
      ? messageById.get(Number(job.assistant_message_id))
      : null;

    if (inbound) {
      const createdAt = String(inbound.created_at ?? job.created_at);
      const receivedAt = String(inbound.received_at ?? createdAt);
      items.push({
        bodyText:
          typeof userMessage?.content === "string" ? userMessage.content : null,
        createdAt,
        createdBy: null,
        dedupeKeys: compactDedupeKeys([
          `reply-job:${job.id}:user_reply`,
          inbound?.id ? `inbound-event:${inbound.id}` : null,
          job.user_message_id ? `talent-message:${job.user_message_id}` : null,
        ]),
        direction: "inbound",
        fromEmail:
          typeof inbound.from_email === "string" ? inbound.from_email : null,
        id: `email-reply-inbound:${job.id}`,
        mailType: "user_reply",
        occurredAt: getOccurredAt({ createdAt, receivedAt }),
        status: job.status === "skipped" ? "skipped" : "received",
        subject: typeof inbound.subject === "string" ? inbound.subject : null,
        toEmail: Array.isArray(inbound.to_addresses)
          ? inbound.to_addresses.join(", ")
          : null,
      });
    }

    if (assistantMessage || job.resend_email_id) {
      const createdAt = String(
        job.processed_at ?? assistantMessage?.created_at ?? job.updated_at
      );
      const subject = buildReplySubject(inbound?.subject ?? null);
      items.push({
        bodyText:
          typeof assistantMessage?.content === "string"
            ? assistantMessage.content
            : null,
        createdAt,
        createdBy: null,
        dedupeKeys: compactDedupeKeys([
          `reply-job:${job.id}:auto_reply`,
          job.assistant_message_id
            ? `talent-message:${job.assistant_message_id}`
            : null,
        ]),
        direction: "outbound",
        fromEmail,
        id: `email-reply-outbound:${job.id}`,
        mailType: "auto_reply",
        occurredAt: getOccurredAt({
          createdAt,
          sentAt: job.processed_at ?? null,
        }),
        status: typeof job.status === "string" ? job.status : "sent",
        subject,
        toEmail:
          typeof inbound?.from_email === "string" ? inbound.from_email : null,
      });
    }
  }

  return items;
}

async function fetchOnboardingMailItems(args: {
  admin: UntypedAdminClient;
  sourceLimit: number;
  userId: string;
}): Promise<InternalCareerTalentMailHistoryItem[]> {
  const { data: messages, error: messagesError } = await args.admin
    .from("talent_messages")
    .select("id, content, created_at")
    .eq("user_id", args.userId)
    .eq("role", "assistant")
    .eq("message_type", "email_onboarding")
    .order("created_at", { ascending: false })
    .range(0, args.sourceLimit - 1);

  if (messagesError) {
    throw new Error(
      messagesError.message ?? "Failed to load email onboarding messages"
    );
  }

  if (!messages?.length) return [];

  const { data: leads, error: leadsError } = await args.admin
    .from("career_email_onboarding_leads")
    .select(
      "id, display_name, email, normalized_email, first_email_resend_id, first_email_sent_at, calendar_cta_sent_at, review_email_resend_id"
    )
    .eq("talent_id", args.userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (leadsError) {
    throw new Error(
      leadsError.message ?? "Failed to load email onboarding lead"
    );
  }

  const lead = leads?.[0] ?? null;
  const fromEmail = getDefaultCareerMailFrom();
  const toEmail =
    typeof lead?.email === "string"
      ? lead.email
      : typeof lead?.normalized_email === "string"
        ? lead.normalized_email
        : null;

  return messages.map((message: any) => {
    const content = String(message.content ?? "");
    const isFirstEmail = content.includes("이메일 남겨주셔서");
    const sentAt = isFirstEmail
      ? (lead?.first_email_sent_at ?? message.created_at)
      : (lead?.calendar_cta_sent_at ?? message.created_at);
    return {
      bodyText: content || null,
      createdAt: String(message.created_at),
      createdBy: null,
      dedupeKeys: compactDedupeKeys([`talent-message:${message.id}`]),
      direction: "outbound" as const,
      fromEmail,
      id: `email-onboarding:${message.id}`,
      mailType: isFirstEmail ? "onboarding" : "onboarding_review",
      occurredAt: getOccurredAt({
        createdAt: String(message.created_at),
        sentAt,
      }),
      status: "sent",
      subject: isFirstEmail
        ? firstOnboardingSubject(lead?.display_name)
        : reviewOnboardingSubject(lead?.display_name),
      toEmail,
    } satisfies InternalCareerTalentMailHistoryItem;
  });
}

async function fetchManualOpsMailItems(args: {
  admin: UntypedAdminClient;
  sourceLimit: number;
  userId: string;
}): Promise<InternalCareerTalentMailHistoryItem[]> {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("id, content, created_at")
    .eq("user_id", args.userId)
    .eq("role", "assistant")
    .eq("message_type", "ops_manual_email")
    .order("created_at", { ascending: false })
    .range(0, args.sourceLimit - 1);

  if (error) {
    throw new Error(error.message ?? "Failed to load manual ops emails");
  }

  return (data ?? []).map((message: any) => {
    const content = String(message.content ?? "");
    const parsed = parseStoredMailMessage(content);
    const createdAt = String(message.created_at);
    return {
      bodyText: parsed.bodyText,
      createdAt,
      createdBy: null,
      dedupeKeys: compactDedupeKeys([`talent-message:${message.id}`]),
      direction: "outbound" as const,
      fromEmail: parsed.fromEmail,
      id: `ops-manual-email:${message.id}`,
      mailType: "manual_ops",
      occurredAt: getOccurredAt({ createdAt }),
      status: "sent",
      subject: parsed.subject,
      toEmail: parsed.toEmail,
    } satisfies InternalCareerTalentMailHistoryItem;
  });
}

async function fetchOpportunityDeliveryMailItems(args: {
  admin: UntypedAdminClient;
  sourceLimit: number;
  userId: string;
}): Promise<InternalCareerTalentMailHistoryItem[]> {
  const { data, error } = await args.admin
    .from("talent_opportunity_delivery")
    .select("id, discovery_run_id, status, payload, sent_at, created_at")
    .eq("talent_id", args.userId)
    .eq("channel", "email")
    .in("status", ["sent", "failed"])
    .order("created_at", { ascending: false })
    .range(0, args.sourceLimit - 1);

  if (error) {
    throw new Error(error.message ?? "Failed to load email delivery logs");
  }

  const fromEmail = getDefaultCareerMailFrom();
  return (data ?? []).map((row: any) => {
    const payload = asRecord(row.payload);
    const createdAt = String(row.created_at);
    const sentAt = typeof row.sent_at === "string" ? row.sent_at : null;
    return {
      bodyText:
        getJsonString(payload, "textBody") ??
        getJsonString(payload, "emailBody") ??
        getJsonString(payload, "message"),
      createdAt,
      createdBy: null,
      dedupeKeys: compactDedupeKeys([
        row.discovery_run_id
          ? `opportunity-discovery-run:${row.discovery_run_id}`
          : null,
      ]),
      direction: "outbound" as const,
      fromEmail,
      id: `opportunity-delivery:${row.id}`,
      mailType: "opportunity_recommendation",
      occurredAt: getOccurredAt({ createdAt, sentAt }),
      status: String(row.status ?? "sent"),
      subject: getJsonString(payload, "subject"),
      toEmail: getJsonString(payload, "toEmail"),
    } satisfies InternalCareerTalentMailHistoryItem;
  });
}

export async function fetchCareerTalentMailHistory(args: {
  limit?: number;
  offset?: number;
  userId: string;
}): Promise<CareerTalentMailHistoryResponse> {
  const limit = Math.max(
    1,
    Math.min(MAX_MAIL_HISTORY_LIMIT, args.limit ?? DEFAULT_MAIL_HISTORY_LIMIT)
  );
  const offset = Math.max(0, args.offset ?? 0);
  const sourceLimit = Math.min(
    MAX_MAIL_HISTORY_SOURCE_LIMIT,
    offset + limit + 1
  );
  const admin = toUntypedAdmin(getTalentSupabaseAdmin());

  const [canonical, replies, onboarding, manualOps, deliveries] =
    await Promise.all([
      fetchMailItemsSafely("career_email_messages", () =>
        fetchCanonicalMailItems({ admin, sourceLimit, userId: args.userId })
      ),
      fetchMailItemsSafely("email_reply_jobs", () =>
        fetchEmailReplyJobMailItems({
          admin,
          sourceLimit,
          userId: args.userId,
        })
      ),
      fetchMailItemsSafely("career_email_onboarding", () =>
        fetchOnboardingMailItems({ admin, sourceLimit, userId: args.userId })
      ),
      fetchMailItemsSafely("ops_manual_email", () =>
        fetchManualOpsMailItems({ admin, sourceLimit, userId: args.userId })
      ),
      fetchMailItemsSafely("talent_opportunity_delivery", () =>
        fetchOpportunityDeliveryMailItems({
          admin,
          sourceLimit,
          userId: args.userId,
        })
      ),
    ]);

  const canonicalDedupeKeys = new Set(
    canonical.flatMap((item) => item.dedupeKeys)
  );
  const legacyItems = [
    ...replies,
    ...onboarding,
    ...manualOps,
    ...deliveries,
  ].filter(
    (item) => !item.dedupeKeys.some((key) => canonicalDedupeKeys.has(key))
  );

  const deduped = new Map<string, InternalCareerTalentMailHistoryItem>();
  for (const item of [...canonical, ...legacyItems]) {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item);
    }
  }

  const allItems = Array.from(deduped.values()).sort(compareMailHistoryItems);
  const messages = allItems
    .slice(offset, offset + limit)
    .map(publicMailItemFromInternal);
  const nextOffset =
    offset + messages.length < allItems.length
      ? offset + messages.length
      : null;

  return {
    messages,
    limit,
    offset,
    hasMore: nextOffset !== null,
    nextOffset,
  };
}

export async function sendCareerTalentMailAndRecord(args: {
  content: string;
  createdBy: string;
  fromEmail: string;
  subject: string;
  userId: string;
}): Promise<CareerTalentMailSendResponse> {
  const admin = getTalentSupabaseAdmin();
  const untypedAdmin = toUntypedAdmin(admin);
  const recipient = await fetchCareerTalentMailRecipient(args.userId);
  const conversationId = await ensureCareerTalentConversation({
    admin,
    userId: args.userId,
  });
  const replyAlias = await createEmailReplyAlias({
    admin,
    conversationId,
    userId: args.userId,
  }).catch((error) => {
    console.warn("[ops-career-mail] reply alias creation skipped", {
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
    return null;
  });
  const historyId = randomUUID();
  const now = new Date().toISOString();
  const bodyText = appendHarperEmailFooterText(args.content);
  const bodyHtml = renderEmailBodyHtmlWithHarperFooter(args.content);
  const baseMetadata = {
    replyTo: replyAlias?.address ?? null,
  };

  const historyRowCreated = await createCareerEmailMessage({
    admin: untypedAdmin,
    payload: {
      body_text: bodyText,
      created_at: now,
      created_by: args.createdBy,
      direction: "outbound",
      from_email: args.fromEmail,
      id: historyId,
      metadata: baseMetadata,
      mail_type: "manual_ops",
      occurred_at: now,
      status: "queued",
      subject: args.subject,
      talent_id: args.userId,
      to_email: recipient.email,
    },
  });

  let resendEmailId: string | null = null;
  try {
    const sendResult = await sendResendEmail({
      from: args.fromEmail,
      html: bodyHtml,
      idempotencyKey: `ops-career/manual/${historyId}`,
      replyTo: replyAlias?.address ?? null,
      subject: args.subject,
      text: bodyText,
      to: recipient.email,
    });
    resendEmailId = sendResult.id ?? null;
  } catch (error) {
    if (historyRowCreated) {
      const failedAt = new Date().toISOString();
      await updateCareerEmailMessage({
        admin: untypedAdmin,
        id: historyId,
        payload: {
          metadata: {
            ...baseMetadata,
            error: error instanceof Error ? error.message : String(error),
          },
          occurred_at: failedAt,
          status: "failed",
        },
      });
    }
    throw error;
  }

  const sentAt = new Date().toISOString();
  const { data: message, error: messageError } = await admin
    .from("talent_messages")
    .insert({
      content: buildStoredMailMessage({
        bodyText,
        fromEmail: args.fromEmail,
        subject: args.subject,
        toEmail: recipient.email,
      }),
      conversation_id: conversationId,
      message_type: "ops_manual_email",
      role: "assistant",
      user_id: args.userId,
    })
    .select("id")
    .single();

  const updatePayload: CareerEmailMessageUpdate = {
    metadata: {
      ...baseMetadata,
      resendEmailId,
    },
    occurred_at: sentAt,
    status: "sent",
  };
  if (message?.id) {
    updatePayload.talent_message_id = message.id;
  }
  if (messageError) {
    updatePayload.metadata = {
      ...baseMetadata,
      talentMessageError: messageError.message,
    };
  }

  if (historyRowCreated) {
    await updateCareerEmailMessage({
      admin: untypedAdmin,
      id: historyId,
      payload: updatePayload,
    });
  }

  await admin
    .from("talent_conversations")
    .update({ updated_at: sentAt })
    .eq("id", conversationId)
    .eq("user_id", args.userId);

  return {
    ok: true,
    historyId,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
  };
}

export async function ingestCareerTalentProfileFromRegisteredLinks(
  userId: string
): Promise<CareerTalentProfileIngestResponse> {
  const admin = getTalentSupabaseAdmin();
  const profile = await fetchTalentUserProfile({ admin, userId });

  if (!profile) {
    throw new Error("Talent user profile was not found");
  }

  const links = (profile.resume_links ?? [])
    .map((link) => String(link ?? "").trim())
    .filter(Boolean);
  const linkedinUrl = pickLinkedinUrl(links);

  if (!linkedinUrl) {
    throw new Error("LinkedIn profile link is required in registered links");
  }

  const ingestion = await ingestTalentProfileFromLinkedin({
    admin,
    userId,
    links,
    resumeText: profile.resume_text ?? null,
    resumeFileName: profile.resume_file_name ?? null,
    resumeStoragePath: profile.resume_storage_path ?? null,
  });

  return {
    ok: true,
    ingestion: {
      linkedinUrl: ingestion.linkedinUrl,
      stats: ingestion.stats,
      warnings: ingestion.warnings,
    },
  };
}
