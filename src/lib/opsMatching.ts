import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  isOpsMatchingExcludeNotInterestedFilter,
  isOpsMatchingNoTagFilter,
} from "@/lib/opsMatchingFilters";
import type { Database } from "@/types/database.types";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;
type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  | "created_at"
  | "email"
  | "headline"
  | "name"
  | "profile_picture"
  | "resume_file_name"
  | "resume_links"
  | "resume_storage_path"
  | "user_id"
>;
type TalentExperienceRow = Pick<
  Database["public"]["Tables"]["talent_experiences"]["Row"],
  "company_name" | "end_date" | "id" | "role" | "start_date" | "talent_id"
>;
type TalentEducationRow = Pick<
  Database["public"]["Tables"]["talent_educations"]["Row"],
  "degree" | "end_date" | "field" | "id" | "school" | "start_date" | "talent_id"
>;
type TalentOpportunityTagRow = {
  created_at: string;
  id: string;
  opportunity_id: string | null;
  tag: string;
  talent_id: string;
  updated_at: string;
};
type TalentOpportunityDeliveryRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_delivery"]["Row"],
  | "channel"
  | "created_at"
  | "id"
  | "payload"
  | "sent_at"
  | "status"
  | "talent_id"
>;
type TalentProgressRow = {
  created_at: string;
  id: string;
  recommendation_id: string | null;
  role_id: string;
  talent_id: string;
  text: string;
  user_id: string | null;
};
type OpportunityDiscoveryRunRow = Pick<
  Database["public"]["Tables"]["opportunity_discovery_run"]["Row"],
  "id" | "trigger_payload"
>;
type TalentRecommendationRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  | "created_at"
  | "discovery_run_id"
  | "feedback"
  | "feedback_at"
  | "feedback_reason"
  | "id"
  | "processed_stage"
  | "recommended_at"
  | "role_id"
  | "saved_stage"
  | "talent_id"
  | "updated_at"
>;

const DEFAULT_MATCHING_TALENT_LIMIT = 20;
const MAX_MATCHING_TALENT_LIMIT = 50;
const MAX_MATCHING_COMPANY_OPTIONS = 500;
const MAX_MATCHING_ROLE_OPTIONS = 500;
const MAX_MATCHING_PROGRESS_ITEMS = 120;
const MAX_MATCHING_REVIEW_ITEMS = 500;
const MAX_MATCHING_TAG_LENGTH = 40;
const MAX_MATCHING_NO_TAG_SCAN_ROWS = 5000;
const MAX_MATCHING_TALENT_ROLE_TAG_ROWS = 5000;
const MAX_MATCHING_PROGRESS_TEXT_LENGTH = 2000;
const MAX_MATCHING_RECOMMENDATION_DELIVERY_ITEMS = 5;
const MATCHING_ID_FILTER_CHUNK_SIZE = 80;
const ACTIVE_ROLE_STATUSES = new Set(["active", "top_priority"]);
const MATCHING_REVIEW_STAGE_TAG_BY_STAGE = {
  accepted: "내부:수락",
  archived: "내부:아카이브",
  hold: "내부:보류",
  pending_connection: "내부:연결대기",
  rejected: "내부:거절",
} as const;
const MATCHING_REVIEW_STAGE_LABEL_BY_STAGE: Record<
  OpsMatchingReviewStageId,
  string
> = {
  accepted: "수락",
  archived: "아카이브",
  hold: "보류",
  pending_connection: "연결 대기",
  recommended: "추천된 사람",
  rejected: "거절",
};
const MATCHING_NOT_INTERESTED_TAG = "관심없음";
const TALENT_POOL_TAILORED_TAG = "적합";

const TALENT_LIST_SELECT =
  "user_id, name, email, profile_picture, headline, created_at, resume_file_name, resume_storage_path, resume_links";

export type OpsMatchingCompanyOption = {
  activeRoleCount: number;
  companyName: string;
  companyWorkspaceId: string;
  logoUrl: string | null;
  totalRoleCount: number;
  updatedAt: string;
};

export type OpsMatchingRoleOption = {
  companyName: string;
  companyWorkspaceId: string;
  descriptionSummary: string | null;
  locationText: string | null;
  roleId: string;
  roleName: string;
  sourceType: string;
  status: string;
  updatedAt: string;
};

export type OpsMatchingProfileLabel = {
  detail: string | null;
  label: string;
  period: string | null;
};

export type OpsMatchingTalentTag = {
  id: string;
  tag: string;
};

export type OpsMatchingTalentRoleTagGroup = {
  companyName: string | null;
  companyWorkspaceId: string | null;
  locationText: string | null;
  roleId: string;
  roleName: string | null;
  status: string | null;
  tags: OpsMatchingTalentTag[];
  updatedAt: string | null;
};

export type OpsMatchingTalentRoleTagsResponse = {
  items: OpsMatchingTalentRoleTagGroup[];
  talentTags: OpsMatchingTalentTag[];
  talentId: string;
};

export type OpsMatchingTalentItem = {
  createdAt: string | null;
  description: string | null;
  email: string | null;
  hasSubmittedMaterial: boolean;
  headline: string | null;
  isOnboardingDone: boolean;
  latestCompany: OpsMatchingProfileLabel | null;
  latestSchool: OpsMatchingProfileLabel | null;
  memoPreview: string | null;
  name: string | null;
  profilePicture: string | null;
  recentCompanies: OpsMatchingProfileLabel[];
  recentSchools: OpsMatchingProfileLabel[];
  tags: OpsMatchingTalentTag[];
  talentTags: OpsMatchingTalentTag[];
  userId: string;
};

export type OpsMatchingTalentListResponse = {
  hasMore: boolean;
  items: OpsMatchingTalentItem[];
  limit: number;
  nextOffset: number | null;
  offset: number;
  totalCount: number;
};

export type OpsMatchingTalentPoolTabId = "all" | "tailored" | "needs_review";

export type OpsMatchingTalentPoolListResponse =
  OpsMatchingTalentListResponse & {
    tab: OpsMatchingTalentPoolTabId;
  };

export type OpsMatchingReviewStageId =
  | "accepted"
  | "archived"
  | "hold"
  | "pending_connection"
  | "recommended"
  | "rejected";

export type OpsMatchingRecommendationSummary = {
  createdAt: string;
  deliveries: OpsMatchingRecommendationDelivery[];
  discoveryRunId: string | null;
  feedback: string | null;
  feedbackAt: string | null;
  feedbackReason: string | null;
  isManualInternalRecommendation: boolean;
  processedStage: string | null;
  recommendationId: string;
  recommendedAt: string;
  roleId: string;
  savedStage: string | null;
  talentId: string;
  updatedAt: string;
};

export type OpsMatchingRecommendationDelivery = {
  bodyText: string | null;
  channel: string;
  createdAt: string;
  id: string;
  sentAt: string | null;
  status: string;
  subject: string | null;
  toEmail: string | null;
};

export type OpsMatchingReviewItem = {
  createdAt: string;
  discoveryRunId: string | null;
  feedback: string | null;
  feedbackAt: string | null;
  feedbackReason: string | null;
  isManualInternalRecommendation: boolean;
  processedStage: string | null;
  recommendationId: string;
  recommendedAt: string;
  roleId: string;
  savedStage: string | null;
  stage: OpsMatchingReviewStageId;
  stageTag: string | null;
  talent: OpsMatchingTalentItem;
  updatedAt: string;
};

export type OpsMatchingReviewBoardResponse = {
  items: OpsMatchingReviewItem[];
  roleId: string;
  totalCount: number;
};

export type OpsMatchingReviewStageUpdateResponse = {
  ok: true;
  roleId: string;
  stage: Exclude<OpsMatchingReviewStageId, "recommended">;
  tags: OpsMatchingTalentTag[];
  talentId: string;
};

export type OpsMatchingProgressItem = {
  companyName: string | null;
  createdAt: string;
  id: string;
  recommendationId: string | null;
  roleId: string;
  roleName: string | null;
  talentId: string;
  text: string;
  userId: string | null;
};

export type OpsMatchingProgressResponse = {
  items: OpsMatchingProgressItem[];
  recommendation: OpsMatchingRecommendationSummary | null;
  roleId: string | null;
  talentId: string;
};

export type OpsMatchingProgressDeleteResponse = {
  ok: true;
  progressId: string;
  roleId: string;
  talentId: string;
};

type DateRange = {
  endExclusiveIso: string | null;
  startIso: string | null;
};

type CompanyRoleName = {
  companyName: string | null;
  roleName: string | null;
};

type CompanyRoleContext = CompanyRoleName & {
  companyWorkspaceId: string | null;
  locationText: string | null;
  status: string | null;
  updatedAt: string | null;
};

function fromOpsMatchingTable<
  TTableName extends "talent_opportunity_tag" | "talent_progress",
>(admin: AdminClient, tableName: TTableName) {
  return admin.from(tableName);
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNullableText(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function isMissingOpsMatchingTableError(error: unknown) {
  const message = String(
    (error as { message?: unknown } | null)?.message ?? error ?? ""
  ).toLowerCase();
  return (
    (message.includes("talent_opportunity_tag") ||
      message.includes("talent_progress")) &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("not found"))
  );
}

function createMissingOpsMatchingTableError(tableName: string) {
  return new Error(
    `${tableName} 테이블이 없습니다. supabase/migrations/20260615143000_ops_matching_progress_tags.sql migration을 적용해 주세요.`
  );
}

function normalizeTag(value: unknown) {
  return normalizeText(value).slice(0, MAX_MATCHING_TAG_LENGTH);
}

function normalizeTagKey(value: unknown) {
  return normalizeTag(value).toLowerCase();
}

const MATCHING_REVIEW_STAGE_BY_TAG_KEY = new Map(
  Object.entries(MATCHING_REVIEW_STAGE_TAG_BY_STAGE).map(([stage, tag]) => [
    normalizeTagKey(tag),
    stage as Exclude<OpsMatchingReviewStageId, "recommended">,
  ])
);

const MATCHING_REVIEW_STAGE_TAG_KEYS = new Set(
  Object.values(MATCHING_REVIEW_STAGE_TAG_BY_STAGE).map(normalizeTagKey)
);

function isAcceptedFeedback(feedback: string | null | undefined) {
  const normalized = normalizeText(feedback).toLowerCase();
  return normalized === "like" || normalized === "positive";
}

function isRejectedFeedback(feedback: string | null | undefined) {
  const normalized = normalizeText(feedback).toLowerCase();
  return normalized === "dislike" || normalized === "negative";
}

function getOpsMatchingReviewStage(args: {
  feedback: string | null | undefined;
  tags: OpsMatchingTalentTag[];
}): { stage: OpsMatchingReviewStageId; stageTag: string | null } {
  for (const tag of args.tags) {
    const stage = MATCHING_REVIEW_STAGE_BY_TAG_KEY.get(
      normalizeTagKey(tag.tag)
    );
    if (stage) return { stage, stageTag: tag.tag };
  }

  if (isAcceptedFeedback(args.feedback)) {
    return { stage: "accepted", stageTag: null };
  }
  if (isRejectedFeedback(args.feedback)) {
    return { stage: "rejected", stageTag: null };
  }
  return { stage: "recommended", stageTag: null };
}

function buildReviewStageProgressText(args: {
  nextStage: Exclude<OpsMatchingReviewStageId, "recommended">;
  previousStage: OpsMatchingReviewStageId;
}) {
  const nextLabel = MATCHING_REVIEW_STAGE_LABEL_BY_STAGE[args.nextStage];
  const previousLabel =
    MATCHING_REVIEW_STAGE_LABEL_BY_STAGE[args.previousStage];
  if (args.previousStage === "recommended") {
    return `Harper Review 보드에서 ${nextLabel}로 옮겼습니다.`;
  }
  return `Harper Review 보드에서 ${previousLabel}에서 ${nextLabel}로 옮겼습니다.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getJsonString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isManualInternalRecommendationPayload(value: unknown) {
  const payload = parseJsonRecord(value);
  if (!payload) return false;
  if (isRecord(payload.manualInternalRecommendation)) return true;
  return payload.entryPoint === "ops_career_manual_internal_recommendation";
}

function buildMatchingIlikePattern(searchQuery: string) {
  return `%${searchQuery.replace(/[\\%_]/g, "\\$&").replace(/[(),]/g, " ")}%`;
}

function compareTalentRows(left: TalentUserRow, right: TalentUserRow) {
  const leftTime = Date.parse(left.created_at ?? "");
  const rightTime = Date.parse(right.created_at ?? "");
  const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
  const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;
  if (safeLeftTime !== safeRightTime) return safeRightTime - safeLeftTime;
  return right.user_id.localeCompare(left.user_id);
}

function chunkValues<T>(values: T[], size = MATCHING_ID_FILTER_CHUNK_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function intersectTalentIdSets(left: Set<string>, right: Set<string>) {
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;
  const result = new Set<string>();
  for (const value of smaller) {
    if (larger.has(value)) result.add(value);
  }
  return result;
}

function subtractTalentIdSet(left: Set<string>, right: Set<string> | null) {
  if (!right || right.size === 0) return new Set(left);
  const result = new Set<string>();
  for (const value of left) {
    if (!right.has(value)) result.add(value);
  }
  return result;
}

export function parseOpsMatchingLimit(value: string | null) {
  const parsed = Number(value ?? DEFAULT_MATCHING_TALENT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_MATCHING_TALENT_LIMIT;
  return Math.max(1, Math.min(MAX_MATCHING_TALENT_LIMIT, Math.floor(parsed)));
}

export function parseOpsMatchingOffset(value: string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function parseOpsMatchingDateOnly(value: string | null) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return normalized;
}

export function parseOpsMatchingTags(value: string | null) {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(",")
        .map(normalizeTag)
        .filter(Boolean)
    )
  );
}

export function parseOpsMatchingTalentPoolTab(
  value: string | null
): OpsMatchingTalentPoolTabId {
  const normalized = normalizeText(value);
  if (
    normalized === "all" ||
    normalized === "tailored" ||
    normalized === "needs_review"
  ) {
    return normalized;
  }
  return "tailored";
}

function normalizeDateRange(args: {
  createdFrom?: string | null;
  createdTo?: string | null;
}): DateRange {
  let startDate = parseOpsMatchingDateOnly(args.createdFrom ?? null);
  let endDate = parseOpsMatchingDateOnly(args.createdTo ?? null);
  if (startDate && endDate && endDate < startDate) {
    const nextStartDate = endDate;
    endDate = startDate;
    startDate = nextStartDate;
  }

  return {
    startIso: startDate ? toKstDayStartIso(startDate) : null,
    endExclusiveIso: endDate ? toKstNextDayStartIso(endDate) : null,
  };
}

function toKstDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0)).toISOString();
}

function toKstNextDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0)
  ).toISOString();
}

function formatYearMonth(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/^(present|current|now|ongoing|재직|현재)$/i.test(normalized)) {
    return "현재";
  }

  const match = normalized.match(/^(\d{4})-(\d{1,2})/);
  if (match) {
    return `${match[1]}.${match[2].padStart(2, "0")}`;
  }

  return normalized;
}

function formatPeriod(args: {
  endDate?: string | null;
  startDate?: string | null;
}) {
  const start = formatYearMonth(args.startDate);
  const end = formatYearMonth(args.endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - 현재`;
  if (end) return `- ${end}`;
  return null;
}

function buildExperienceLabel(
  row: Pick<
    TalentExperienceRow,
    "company_name" | "end_date" | "role" | "start_date"
  >
): OpsMatchingProfileLabel | null {
  const companyName = normalizeNullableText(row.company_name);
  const role = normalizeNullableText(row.role);
  const label = companyName ?? role ?? "";
  if (!label) return null;
  return {
    detail: role,
    label,
    period: formatPeriod({
      endDate: row.end_date,
      startDate: row.start_date,
    }),
  };
}

function buildEducationLabel(
  row: Pick<
    TalentEducationRow,
    "degree" | "end_date" | "field" | "school" | "start_date"
  >
): OpsMatchingProfileLabel | null {
  const school = normalizeNullableText(row.school);
  const detail = [row.degree, row.field]
    .map(normalizeNullableText)
    .filter(Boolean)
    .join(" · ");
  const label = school ?? detail;
  if (!label) return null;
  return {
    detail: detail || null,
    label,
    period: formatPeriod({
      endDate: row.end_date,
      startDate: row.start_date,
    }),
  };
}

function getHasActiveRole(status: string | null | undefined) {
  return ACTIVE_ROLE_STATUSES.has(
    String(status ?? "")
      .trim()
      .toLowerCase()
  );
}

async function fetchTagMatchedTalentIds(args: {
  admin: AdminClient;
  roleId?: string | null;
  tags: string[];
}) {
  const tagKeys = new Set(args.tags.map(normalizeTagKey).filter(Boolean));
  const matchedTalentIds = new Set<string>();
  const roleId = normalizeText(args.roleId);
  if (tagKeys.size === 0) return matchedTalentIds;

  let query = fromOpsMatchingTable(args.admin, "talent_opportunity_tag")
    .select("talent_id, tag")
    .limit(5000);
  query = roleId
    ? query.eq("opportunity_id", roleId)
    : query.is("opportunity_id", null);
  const { data, error } = await query;

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      return matchedTalentIds;
    }
    throw new Error(error.message ?? "Failed to load matching tags");
  }

  for (const row of data ?? []) {
    if (tagKeys.has(normalizeTagKey(row.tag))) {
      matchedTalentIds.add(row.talent_id);
    }
  }

  return matchedTalentIds;
}

async function fetchTaggedTalentIds(args: {
  admin: AdminClient;
  roleId?: string | null;
}) {
  const taggedTalentIds = new Set<string>();
  const roleId = normalizeText(args.roleId);

  let query = fromOpsMatchingTable(args.admin, "talent_opportunity_tag")
    .select("talent_id")
    .limit(MAX_MATCHING_NO_TAG_SCAN_ROWS);
  query = roleId
    ? query.eq("opportunity_id", roleId)
    : query.is("opportunity_id", null);
  const { data, error } = await query;

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      return taggedTalentIds;
    }
    throw new Error(error.message ?? "Failed to load tagged talents");
  }

  for (const row of data ?? []) {
    const talentId = normalizeText(row.talent_id);
    if (talentId) taggedTalentIds.add(talentId);
  }

  return taggedTalentIds;
}

async function fetchMemoPreviewMap(args: {
  admin: AdminClient;
  talentIds: string[];
}) {
  const memoMap = new Map<string, string>();
  if (args.talentIds.length === 0) return memoMap;

  const { data, error } = await args.admin
    .from("talent_ops_profile_memos")
    .select("talent_id, content, updated_at, created_at")
    .in("talent_id", args.talentIds)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(args.talentIds.length * 5);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent memos");
  }

  for (const row of data ?? []) {
    const talentId = normalizeText(row.talent_id);
    if (!talentId || memoMap.has(talentId)) continue;
    const content = normalizeText(row.content);
    if (content) memoMap.set(talentId, content.slice(0, 240));
  }

  return memoMap;
}

async function fetchTagMap(args: {
  admin: AdminClient;
  roleId?: string | null;
  talentIds: string[];
}) {
  const tagMap = new Map<string, OpsMatchingTalentTag[]>();
  const roleId = normalizeText(args.roleId);
  if (args.talentIds.length === 0) return tagMap;

  let query = fromOpsMatchingTable(args.admin, "talent_opportunity_tag")
    .select("id, talent_id, tag, updated_at")
    .in("talent_id", args.talentIds)
    .order("updated_at", { ascending: false });
  query = roleId
    ? query.eq("opportunity_id", roleId)
    : query.is("opportunity_id", null);
  const { data, error } = await query;

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      return tagMap;
    }
    throw new Error(error.message ?? "Failed to load talent tags");
  }

  for (const row of data ?? []) {
    const list = tagMap.get(row.talent_id) ?? [];
    list.push({ id: row.id, tag: row.tag });
    tagMap.set(row.talent_id, list);
  }

  return tagMap;
}

function hasSubmittedLinkedInLink(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.some((link) => {
    const normalized = normalizeText(link).toLowerCase();
    return normalized.includes("linkedin.com");
  });
}

function hasSubmittedMaterial(row: TalentUserRow) {
  return Boolean(
    normalizeText(row.resume_file_name) ||
    normalizeText(row.resume_storage_path) ||
    hasSubmittedLinkedInLink(row.resume_links)
  );
}

async function fetchOnboardingDoneMap(args: {
  admin: AdminClient;
  talentIds: string[];
}) {
  const onboardingDoneMap = new Map<string, boolean>();
  if (args.talentIds.length === 0) return onboardingDoneMap;

  const { data, error } = await args.admin
    .from("talent_setting")
    .select("user_id, is_onboarding_done")
    .in("user_id", args.talentIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load onboarding status");
  }

  for (const row of data ?? []) {
    onboardingDoneMap.set(row.user_id, Boolean(row.is_onboarding_done));
  }

  return onboardingDoneMap;
}

async function fetchProfileMaps(args: {
  admin: AdminClient;
  talentIds: string[];
}) {
  const companyMap = new Map<string, OpsMatchingProfileLabel[]>();
  const schoolMap = new Map<string, OpsMatchingProfileLabel[]>();
  if (args.talentIds.length === 0) return { companyMap, schoolMap };

  const [experienceResult, educationResult] = await Promise.all([
    args.admin
      .from("talent_experiences")
      .select("id, talent_id, company_name, role, start_date, end_date")
      .in("talent_id", args.talentIds)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }),
    args.admin
      .from("talent_educations")
      .select("id, talent_id, school, degree, field, start_date, end_date")
      .in("talent_id", args.talentIds)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }),
  ]);

  if (experienceResult.error) {
    throw new Error(
      experienceResult.error.message ?? "Failed to load talent experiences"
    );
  }
  if (educationResult.error) {
    throw new Error(
      educationResult.error.message ?? "Failed to load talent educations"
    );
  }

  for (const row of (experienceResult.data ?? []) as TalentExperienceRow[]) {
    const label = buildExperienceLabel(row);
    if (!label) continue;
    const list = companyMap.get(row.talent_id) ?? [];
    list.push(label);
    companyMap.set(row.talent_id, list);
  }

  for (const row of (educationResult.data ?? []) as TalentEducationRow[]) {
    const label = buildEducationLabel(row);
    if (!label) continue;
    const list = schoolMap.get(row.talent_id) ?? [];
    list.push(label);
    schoolMap.set(row.talent_id, list);
  }

  return { companyMap, schoolMap };
}

async function loadTalentRowsByIds(args: {
  admin: AdminClient;
  dateRange: DateRange;
  limit: number;
  matchedTagTalentIds: Set<string>;
  offset: number;
  searchQuery: string;
}) {
  const matchedIds = Array.from(args.matchedTagTalentIds).filter(Boolean);
  if (matchedIds.length === 0) {
    return { rows: [] as TalentUserRow[], totalCount: 0 };
  }

  const rows: TalentUserRow[] = [];
  const searchPattern = args.searchQuery
    ? buildMatchingIlikePattern(args.searchQuery)
    : "";

  for (
    let index = 0;
    index < matchedIds.length;
    index += MATCHING_ID_FILTER_CHUNK_SIZE
  ) {
    const chunk = matchedIds.slice(
      index,
      index + MATCHING_ID_FILTER_CHUNK_SIZE
    );
    let query = args.admin
      .from("talent_users")
      .select(TALENT_LIST_SELECT)
      .in("user_id", chunk);

    if (args.dateRange.startIso) {
      query = query.gte("created_at", args.dateRange.startIso);
    }
    if (args.dateRange.endExclusiveIso) {
      query = query.lt("created_at", args.dateRange.endExclusiveIso);
    }
    if (searchPattern) {
      query = query.or(
        `name.ilike.${searchPattern},email.ilike.${searchPattern}`
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message ?? "Failed to load tagged talents");
    }

    rows.push(...((data ?? []) as TalentUserRow[]));
  }

  rows.sort(compareTalentRows);
  return {
    rows: rows.slice(args.offset, args.offset + args.limit),
    totalCount: rows.length,
  };
}

async function loadTalentRowsByTagState(args: {
  admin: AdminClient;
  dateRange: DateRange;
  excludedTalentIds: Set<string> | null;
  includeNoTag: boolean;
  limit: number;
  matchedTagTalentIds: Set<string> | null;
  offset: number;
  requiredTalentIds?: Set<string> | null;
  searchQuery: string;
  taggedTalentIds: Set<string> | null;
}) {
  const searchPattern = args.searchQuery
    ? buildMatchingIlikePattern(args.searchQuery)
    : "";

  let query = args.admin
    .from("talent_users")
    .select(TALENT_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(MAX_MATCHING_NO_TAG_SCAN_ROWS);

  if (args.dateRange.startIso) {
    query = query.gte("created_at", args.dateRange.startIso);
  }
  if (args.dateRange.endExclusiveIso) {
    query = query.lt("created_at", args.dateRange.endExclusiveIso);
  }
  if (searchPattern) {
    query = query.or(
      `name.ilike.${searchPattern},email.ilike.${searchPattern}`
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to load filtered talents");
  }

  const hasPositiveTagFilter =
    Boolean(args.matchedTagTalentIds) || args.includeNoTag;
  const rows = ((data ?? []) as TalentUserRow[]).filter((row) => {
    if (args.excludedTalentIds?.has(row.user_id)) return false;
    if (args.requiredTalentIds && !args.requiredTalentIds.has(row.user_id)) {
      return false;
    }
    if (!hasPositiveTagFilter) return true;
    if (args.matchedTagTalentIds?.has(row.user_id)) return true;
    return Boolean(
      args.includeNoTag && !args.taggedTalentIds?.has(row.user_id)
    );
  });

  return {
    rows: rows.slice(args.offset, args.offset + args.limit),
    totalCount: rows.length,
  };
}

async function loadTalentRows(args: {
  admin: AdminClient;
  dateRange: DateRange;
  limit: number;
  matchedTagTalentIds: Set<string> | null;
  offset: number;
  searchQuery: string;
}) {
  if (args.matchedTagTalentIds) {
    return loadTalentRowsByIds({
      admin: args.admin,
      dateRange: args.dateRange,
      limit: args.limit,
      matchedTagTalentIds: args.matchedTagTalentIds,
      offset: args.offset,
      searchQuery: args.searchQuery,
    });
  }

  const searchPattern = args.searchQuery
    ? buildMatchingIlikePattern(args.searchQuery)
    : "";

  let query = args.admin
    .from("talent_users")
    .select(TALENT_LIST_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(args.offset, args.offset + args.limit - 1);

  if (args.dateRange.startIso) {
    query = query.gte("created_at", args.dateRange.startIso);
  }
  if (args.dateRange.endExclusiveIso) {
    query = query.lt("created_at", args.dateRange.endExclusiveIso);
  }
  if (searchPattern) {
    query = query.or(
      `name.ilike.${searchPattern},email.ilike.${searchPattern}`
    );
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to load matching talents");
  }

  const sourceRows = (data ?? []) as TalentUserRow[];
  return {
    rows: sourceRows,
    totalCount: count ?? sourceRows.length,
  };
}

async function fetchTalentRowMap(args: {
  admin: AdminClient;
  talentIds: string[];
}) {
  const talentRowMap = new Map<string, TalentUserRow>();
  const talentIds = Array.from(new Set(args.talentIds.filter(Boolean)));
  if (talentIds.length === 0) return talentRowMap;

  for (const chunk of chunkValues(talentIds)) {
    const { data, error } = await args.admin
      .from("talent_users")
      .select(TALENT_LIST_SELECT)
      .in("user_id", chunk);

    if (error) {
      throw new Error(error.message ?? "Failed to load matching talents");
    }

    for (const row of (data ?? []) as TalentUserRow[]) {
      talentRowMap.set(row.user_id, row);
    }
  }

  return talentRowMap;
}

async function buildOpsMatchingTalentItems(args: {
  admin: AdminClient;
  roleId?: string | null;
  rows: TalentUserRow[];
}) {
  const talentIds = args.rows.map((row) => row.user_id);
  const roleId = normalizeText(args.roleId);
  const scopedTagsPromise = fetchTagMap({
    admin: args.admin,
    roleId,
    talentIds,
  });
  const [
    memoPreviewMap,
    scopedTagMap,
    talentTagMap,
    profileMaps,
    onboardingDoneMap,
  ] = await Promise.all([
    fetchMemoPreviewMap({ admin: args.admin, talentIds }),
    scopedTagsPromise,
    roleId
      ? fetchTagMap({ admin: args.admin, roleId: null, talentIds })
      : scopedTagsPromise,
    fetchProfileMaps({ admin: args.admin, talentIds }),
    fetchOnboardingDoneMap({ admin: args.admin, talentIds }),
  ]);

  return args.rows.map((row) => {
    const recentCompanies = profileMaps.companyMap.get(row.user_id) ?? [];
    const recentSchools = profileMaps.schoolMap.get(row.user_id) ?? [];
    return {
      createdAt: row.created_at,
      description: null,
      email: row.email,
      hasSubmittedMaterial: hasSubmittedMaterial(row),
      headline: row.headline,
      isOnboardingDone: onboardingDoneMap.get(row.user_id) ?? false,
      latestCompany: recentCompanies[0] ?? null,
      latestSchool: recentSchools[0] ?? null,
      memoPreview: memoPreviewMap.get(row.user_id) ?? null,
      name: row.name,
      profilePicture: row.profile_picture,
      recentCompanies,
      recentSchools,
      tags: scopedTagMap.get(row.user_id) ?? [],
      talentTags: talentTagMap.get(row.user_id) ?? [],
      userId: row.user_id,
    } satisfies OpsMatchingTalentItem;
  });
}

export async function fetchOpsMatchingCompanies(args: {
  query?: string | null;
}): Promise<OpsMatchingCompanyOption[]> {
  const admin = getSupabaseAdmin();
  const companyQuery = normalizeText(args.query).toLowerCase();

  const { data: roleRows, error: roleError } = await admin
    .from("company_roles")
    .select("company_workspace_id, status, updated_at")
    .eq("source_type", "internal")
    .in("status", ["active", "top_priority"])
    .order("updated_at", { ascending: false })
    .limit(MAX_MATCHING_ROLE_OPTIONS);

  if (roleError) {
    throw new Error(roleError.message ?? "Failed to load internal roles");
  }

  const roleCounts = new Map<
    string,
    {
      activeRoleCount: number;
      latestRoleUpdatedAt: string;
      totalRoleCount: number;
    }
  >();
  for (const row of roleRows ?? []) {
    const workspaceId = normalizeText(row.company_workspace_id);
    if (!workspaceId) continue;
    const current = roleCounts.get(workspaceId) ?? {
      activeRoleCount: 0,
      latestRoleUpdatedAt: row.updated_at,
      totalRoleCount: 0,
    };
    current.totalRoleCount += 1;
    if (getHasActiveRole(row.status)) current.activeRoleCount += 1;
    if (row.updated_at > current.latestRoleUpdatedAt) {
      current.latestRoleUpdatedAt = row.updated_at;
    }
    roleCounts.set(workspaceId, current);
  }

  const workspaceIds = Array.from(roleCounts.keys()).slice(
    0,
    MAX_MATCHING_COMPANY_OPTIONS
  );
  if (workspaceIds.length === 0) return [];

  const workspaces: Array<{
    company_name: string;
    company_workspace_id: string;
    logo_url: string | null;
    updated_at: string;
  }> = [];
  for (const chunk of chunkValues(workspaceIds)) {
    const { data, error } = await admin
      .from("company_workspace")
      .select("company_workspace_id, company_name, logo_url, updated_at")
      .in("company_workspace_id", chunk);

    if (error) {
      throw new Error(error.message ?? "Failed to load matching companies");
    }

    for (const row of data ?? []) {
      if (
        companyQuery &&
        !String(row.company_name ?? "")
          .toLowerCase()
          .includes(companyQuery)
      ) {
        continue;
      }
      workspaces.push(row);
    }
  }

  return workspaces
    .map((item) => {
      const counts = roleCounts.get(item.company_workspace_id) ?? {
        activeRoleCount: 0,
        latestRoleUpdatedAt: item.updated_at,
        totalRoleCount: 0,
      };
      return {
        activeRoleCount: counts.activeRoleCount,
        companyName: item.company_name,
        companyWorkspaceId: item.company_workspace_id,
        logoUrl: item.logo_url,
        totalRoleCount: counts.totalRoleCount,
        updatedAt: counts.latestRoleUpdatedAt,
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function fetchOpsMatchingRoles(args: {
  companyWorkspaceId?: string | null;
}): Promise<OpsMatchingRoleOption[]> {
  const companyWorkspaceId = normalizeText(args.companyWorkspaceId);
  if (!companyWorkspaceId) return [];

  const admin = getSupabaseAdmin();
  const [{ data: workspace, error: workspaceError }, { data, error }] =
    await Promise.all([
      admin
        .from("company_workspace")
        .select("company_workspace_id, company_name")
        .eq("company_workspace_id", companyWorkspaceId)
        .maybeSingle(),
      admin
        .from("company_roles")
        .select(
          "role_id, company_workspace_id, name, description_summary, location_text, source_type, status, updated_at"
        )
        .eq("company_workspace_id", companyWorkspaceId)
        .eq("source_type", "internal")
        .in("status", ["active", "top_priority"])
        .order("updated_at", { ascending: false })
        .limit(MAX_MATCHING_ROLE_OPTIONS),
    ]);

  if (workspaceError) {
    throw new Error(workspaceError.message ?? "Failed to load company");
  }
  if (error) {
    throw new Error(error.message ?? "Failed to load matching roles");
  }

  const companyName = workspace?.company_name ?? "회사명 없음";
  return (data ?? []).map((role) => ({
    companyName,
    companyWorkspaceId: role.company_workspace_id,
    descriptionSummary: role.description_summary,
    locationText: role.location_text,
    roleId: role.role_id,
    roleName: role.name,
    sourceType: role.source_type,
    status: role.status,
    updatedAt: role.updated_at,
  }));
}

export async function fetchOpsMatchingTalents(args: {
  createdFrom?: string | null;
  createdTo?: string | null;
  limit?: number;
  offset?: number;
  query?: string | null;
  roleId?: string | null;
  tags?: string[];
}): Promise<OpsMatchingTalentListResponse> {
  const limit = Math.max(
    1,
    Math.min(
      MAX_MATCHING_TALENT_LIMIT,
      args.limit ?? DEFAULT_MATCHING_TALENT_LIMIT
    )
  );
  const offset = Math.max(0, args.offset ?? 0);
  const roleId = normalizeText(args.roleId);
  if (!roleId) throw new Error("roleId is required");

  const searchQuery = normalizeText(args.query).toLowerCase();
  const tags = Array.from(new Set((args.tags ?? []).map(normalizeTag))).filter(
    Boolean
  );
  const hasNoTagFilter = tags.some(isOpsMatchingNoTagFilter);
  const excludeNotInterested = tags.some(
    isOpsMatchingExcludeNotInterestedFilter
  );
  const matchingTags = tags.filter(
    (tag) =>
      !isOpsMatchingNoTagFilter(tag) &&
      !isOpsMatchingExcludeNotInterestedFilter(tag)
  );
  const dateRange = normalizeDateRange({
    createdFrom: args.createdFrom,
    createdTo: args.createdTo,
  });
  const admin = getSupabaseAdmin();
  const [matchedTagTalentIds, taggedTalentIds, excludedTalentIds] =
    await Promise.all([
      matchingTags.length > 0
        ? fetchTagMatchedTalentIds({ admin, roleId, tags: matchingTags })
        : Promise.resolve(null),
      hasNoTagFilter
        ? fetchTaggedTalentIds({ admin, roleId })
        : Promise.resolve(null),
      excludeNotInterested
        ? fetchTagMatchedTalentIds({
            admin,
            roleId,
            tags: [MATCHING_NOT_INTERESTED_TAG],
          })
        : Promise.resolve(null),
    ]);

  if (
    matchingTags.length > 0 &&
    matchedTagTalentIds &&
    matchedTagTalentIds.size === 0 &&
    !hasNoTagFilter
  ) {
    return {
      hasMore: false,
      items: [],
      limit,
      nextOffset: null,
      offset,
      totalCount: 0,
    };
  }

  const shouldScanByTagState = hasNoTagFilter || excludeNotInterested;
  const { rows, totalCount } = shouldScanByTagState
    ? await loadTalentRowsByTagState({
        admin,
        dateRange,
        excludedTalentIds,
        includeNoTag: hasNoTagFilter,
        limit,
        matchedTagTalentIds,
        offset,
        searchQuery,
        taggedTalentIds,
      })
    : await loadTalentRows({
        admin,
        dateRange,
        limit,
        matchedTagTalentIds,
        offset,
        searchQuery,
      });
  const items = await buildOpsMatchingTalentItems({ admin, roleId, rows });
  const nextOffset =
    offset + items.length < totalCount ? offset + items.length : null;

  return {
    hasMore: nextOffset !== null,
    items,
    limit,
    nextOffset,
    offset,
    totalCount,
  };
}

function emptyTalentPoolResponse(args: {
  limit: number;
  offset: number;
  tab: OpsMatchingTalentPoolTabId;
}): OpsMatchingTalentPoolListResponse {
  return {
    hasMore: false,
    items: [],
    limit: args.limit,
    nextOffset: null,
    offset: args.offset,
    tab: args.tab,
    totalCount: 0,
  };
}

export async function fetchOpsMatchingTalentPool(args: {
  createdFrom?: string | null;
  createdTo?: string | null;
  limit?: number;
  offset?: number;
  query?: string | null;
  tab?: OpsMatchingTalentPoolTabId | null;
  tags?: string[];
}): Promise<OpsMatchingTalentPoolListResponse> {
  const limit = Math.max(
    1,
    Math.min(
      MAX_MATCHING_TALENT_LIMIT,
      args.limit ?? DEFAULT_MATCHING_TALENT_LIMIT
    )
  );
  const offset = Math.max(0, args.offset ?? 0);
  const tab = args.tab ?? "tailored";
  const searchQuery = normalizeText(args.query).toLowerCase();
  const tags = Array.from(new Set((args.tags ?? []).map(normalizeTag))).filter(
    Boolean
  );
  const hasNoTagFilter =
    tab === "needs_review" || tags.some(isOpsMatchingNoTagFilter);
  const excludeNotInterested = tags.some(
    isOpsMatchingExcludeNotInterestedFilter
  );
  const matchingTags = tags.filter(
    (tag) =>
      !isOpsMatchingNoTagFilter(tag) &&
      !isOpsMatchingExcludeNotInterestedFilter(tag)
  );
  const dateRange = normalizeDateRange({
    createdFrom: args.createdFrom,
    createdTo: args.createdTo,
  });
  const admin = getSupabaseAdmin();
  const [
    matchedTagTalentIds,
    taggedTalentIds,
    excludedTalentIds,
    tailoredTalentIds,
  ] = await Promise.all([
    matchingTags.length > 0
      ? fetchTagMatchedTalentIds({ admin, roleId: null, tags: matchingTags })
      : Promise.resolve(null),
    hasNoTagFilter
      ? fetchTaggedTalentIds({ admin, roleId: null })
      : Promise.resolve(null),
    excludeNotInterested
      ? fetchTagMatchedTalentIds({
          admin,
          roleId: null,
          tags: [MATCHING_NOT_INTERESTED_TAG],
        })
      : Promise.resolve(null),
    tab === "tailored"
      ? fetchTagMatchedTalentIds({
          admin,
          roleId: null,
          tags: [TALENT_POOL_TAILORED_TAG],
        })
      : Promise.resolve(null),
  ]);

  let directMatchedTalentIds = matchedTagTalentIds;
  if (tailoredTalentIds) {
    directMatchedTalentIds = directMatchedTalentIds
      ? intersectTalentIdSets(directMatchedTalentIds, tailoredTalentIds)
      : new Set(tailoredTalentIds);
  }
  if (directMatchedTalentIds && excludedTalentIds) {
    directMatchedTalentIds = subtractTalentIdSet(
      directMatchedTalentIds,
      excludedTalentIds
    );
  }

  if (
    ((matchingTags.length > 0 && matchedTagTalentIds?.size === 0) ||
      tailoredTalentIds?.size === 0 ||
      directMatchedTalentIds?.size === 0) &&
    !hasNoTagFilter
  ) {
    return emptyTalentPoolResponse({ limit, offset, tab });
  }

  const shouldScanByTagState =
    hasNoTagFilter || (excludeNotInterested && !directMatchedTalentIds);
  const { rows, totalCount } = shouldScanByTagState
    ? await loadTalentRowsByTagState({
        admin,
        dateRange,
        excludedTalentIds,
        includeNoTag: hasNoTagFilter,
        limit,
        matchedTagTalentIds,
        offset,
        requiredTalentIds: tailoredTalentIds,
        searchQuery,
        taggedTalentIds,
      })
    : await loadTalentRows({
        admin,
        dateRange,
        limit,
        matchedTagTalentIds: directMatchedTalentIds,
        offset,
        searchQuery,
      });
  const items = await buildOpsMatchingTalentItems({
    admin,
    roleId: null,
    rows,
  });
  const nextOffset =
    offset + items.length < totalCount ? offset + items.length : null;

  return {
    hasMore: nextOffset !== null,
    items,
    limit,
    nextOffset,
    offset,
    tab,
    totalCount,
  };
}

async function fetchManualInternalRecommendationRunIds(args: {
  admin: AdminClient;
  runIds: string[];
}) {
  const uniqueRunIds = Array.from(
    new Set(args.runIds.map(normalizeText))
  ).filter(Boolean);
  const manualRunIds = new Set<string>();
  if (uniqueRunIds.length === 0) return manualRunIds;

  for (const chunk of chunkValues(uniqueRunIds)) {
    const { data, error } = await args.admin
      .from("opportunity_discovery_run")
      .select("id, trigger_payload")
      .in("id", chunk);

    if (error) {
      throw new Error(
        error.message ?? "Failed to load matching discovery runs"
      );
    }

    for (const row of (data ?? []) as OpportunityDiscoveryRunRow[]) {
      if (isManualInternalRecommendationPayload(row.trigger_payload)) {
        manualRunIds.add(row.id);
      }
    }
  }

  return manualRunIds;
}

export async function fetchOpsMatchingReviewBoard(args: {
  recommendedFrom?: string | null;
  recommendedTo?: string | null;
  roleId?: string | null;
  tags?: string[];
}): Promise<OpsMatchingReviewBoardResponse> {
  const roleId = normalizeText(args.roleId);
  if (!roleId) throw new Error("roleId is required");

  const admin = getSupabaseAdmin();
  const tags = Array.from(new Set((args.tags ?? []).map(normalizeTag))).filter(
    Boolean
  );
  const hasNoTagFilter = tags.some(isOpsMatchingNoTagFilter);
  const excludeNotInterested = tags.some(
    isOpsMatchingExcludeNotInterestedFilter
  );
  const matchingTags = tags.filter(
    (tag) =>
      !isOpsMatchingNoTagFilter(tag) &&
      !isOpsMatchingExcludeNotInterestedFilter(tag)
  );
  const dateRange = normalizeDateRange({
    createdFrom: args.recommendedFrom,
    createdTo: args.recommendedTo,
  });
  const [matchedTagTalentIds, taggedTalentIds, excludedTalentIds] =
    await Promise.all([
      matchingTags.length > 0
        ? fetchTagMatchedTalentIds({ admin, roleId, tags: matchingTags })
        : Promise.resolve(null),
      hasNoTagFilter
        ? fetchTaggedTalentIds({ admin, roleId })
        : Promise.resolve(null),
      excludeNotInterested
        ? fetchTagMatchedTalentIds({
            admin,
            roleId,
            tags: [MATCHING_NOT_INTERESTED_TAG],
          })
        : Promise.resolve(null),
    ]);

  if (
    matchingTags.length > 0 &&
    matchedTagTalentIds &&
    matchedTagTalentIds.size === 0 &&
    !hasNoTagFilter
  ) {
    return {
      items: [],
      roleId,
      totalCount: 0,
    };
  }

  let query = admin
    .from("talent_opportunity_recommendation")
    .select(
      "id, talent_id, role_id, discovery_run_id, feedback, feedback_at, feedback_reason, processed_stage, saved_stage, recommended_at, created_at, updated_at"
    )
    .eq("role_id", roleId)
    .order("recommended_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false });

  if (dateRange.startIso) {
    query = query.gte("recommended_at", dateRange.startIso);
  }
  if (dateRange.endExclusiveIso) {
    query = query.lt("recommended_at", dateRange.endExclusiveIso);
  }
  if (matchedTagTalentIds && !hasNoTagFilter) {
    query = query.in("talent_id", Array.from(matchedTagTalentIds));
  }

  const { data, error } = await query.limit(
    hasNoTagFilter || excludeNotInterested
      ? MAX_MATCHING_NO_TAG_SCAN_ROWS
      : MAX_MATCHING_REVIEW_ITEMS
  );

  if (error) {
    throw new Error(error.message ?? "Failed to load Harper review board");
  }

  const seenTalentIds = new Set<string>();
  const recommendationRows: TalentRecommendationRow[] = [];
  const hasPositiveTagFilter = matchingTags.length > 0 || hasNoTagFilter;
  for (const row of (data ?? []) as TalentRecommendationRow[]) {
    const talentId = normalizeText(row.talent_id);
    if (!talentId || seenTalentIds.has(talentId)) continue;
    if (excludedTalentIds?.has(talentId)) continue;
    if (hasPositiveTagFilter) {
      const matchesSelectedTag = Boolean(matchedTagTalentIds?.has(talentId));
      const matchesNoTag = Boolean(
        hasNoTagFilter && !taggedTalentIds?.has(talentId)
      );
      if (!matchesSelectedTag && !matchesNoTag) continue;
    }
    seenTalentIds.add(talentId);
    recommendationRows.push(row);
    if (recommendationRows.length >= MAX_MATCHING_REVIEW_ITEMS) break;
  }

  const talentRowMap = await fetchTalentRowMap({
    admin,
    talentIds: recommendationRows.map((row) => row.talent_id),
  });
  const talentRows = recommendationRows
    .map((row) => talentRowMap.get(row.talent_id))
    .filter((row): row is TalentUserRow => Boolean(row));
  const talentItems = await buildOpsMatchingTalentItems({
    admin,
    roleId,
    rows: talentRows,
  });
  const talentItemMap = new Map(
    talentItems.map((talent) => [talent.userId, talent])
  );
  const manualRunIds = await fetchManualInternalRecommendationRunIds({
    admin,
    runIds: recommendationRows.map((row) => row.discovery_run_id ?? ""),
  });

  const items = recommendationRows
    .map((row): OpsMatchingReviewItem | null => {
      const talent = talentItemMap.get(row.talent_id);
      if (!talent) return null;
      const discoveryRunId = row.discovery_run_id ?? null;
      const stage = getOpsMatchingReviewStage({
        feedback: row.feedback,
        tags: talent.tags,
      });
      return {
        createdAt: row.created_at,
        discoveryRunId,
        feedback: row.feedback,
        feedbackAt: row.feedback_at,
        feedbackReason: row.feedback_reason,
        isManualInternalRecommendation:
          discoveryRunId !== null && manualRunIds.has(discoveryRunId),
        processedStage: row.processed_stage,
        recommendationId: row.id,
        recommendedAt: row.recommended_at,
        roleId: row.role_id,
        savedStage: row.saved_stage,
        stage: stage.stage,
        stageTag: stage.stageTag,
        talent,
        updatedAt: row.updated_at,
      };
    })
    .filter((item): item is OpsMatchingReviewItem => item !== null);

  return {
    items,
    roleId,
    totalCount: items.length,
  };
}

export async function addOpsMatchingTalentTag(args: {
  roleId?: string | null;
  tag: unknown;
  talentId: string;
}) {
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  const tag = normalizeTag(args.tag);
  if (!talentId) throw new Error("talentId is required");
  if (!tag) throw new Error("tag is required");

  const admin = getSupabaseAdmin();
  let existingQuery = fromOpsMatchingTable(admin, "talent_opportunity_tag")
    .select("id, tag")
    .eq("talent_id", talentId);
  existingQuery = roleId
    ? existingQuery.eq("opportunity_id", roleId)
    : existingQuery.is("opportunity_id", null);

  const { data: existing, error: existingError } = await existingQuery;

  if (existingError) {
    if (isMissingOpsMatchingTableError(existingError)) {
      throw createMissingOpsMatchingTableError("talent_opportunity_tag");
    }
    throw new Error(existingError.message ?? "Failed to load tags");
  }

  const tagKey = normalizeTagKey(tag);
  if (
    ((existing ?? []) as Pick<TalentOpportunityTagRow, "tag">[]).some(
      (row) => normalizeTagKey(row.tag) === tagKey
    )
  ) {
    return fetchOpsMatchingTalentTags({ roleId, talentId });
  }

  const { error } = await fromOpsMatchingTable(
    admin,
    "talent_opportunity_tag"
  ).insert({
    opportunity_id: roleId || null,
    tag,
    talent_id: talentId,
    updated_at: new Date().toISOString(),
  });

  if (error && error.code !== "23505") {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("talent_opportunity_tag");
    }
    throw new Error(error.message ?? "Failed to save tag");
  }

  return fetchOpsMatchingTalentTags({ roleId, talentId });
}

export async function deleteOpsMatchingTalentTag(args: {
  roleId?: string | null;
  tagId: string;
  talentId: string;
}) {
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  const tagId = normalizeText(args.tagId);
  if (!talentId) throw new Error("talentId is required");
  if (!tagId) throw new Error("tagId is required");

  const admin = getSupabaseAdmin();
  let deleteQuery = fromOpsMatchingTable(admin, "talent_opportunity_tag")
    .delete()
    .eq("id", tagId)
    .eq("talent_id", talentId);
  deleteQuery = roleId
    ? deleteQuery.eq("opportunity_id", roleId)
    : deleteQuery.is("opportunity_id", null);

  const { error } = await deleteQuery;

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("talent_opportunity_tag");
    }
    throw new Error(error.message ?? "Failed to delete tag");
  }

  return fetchOpsMatchingTalentTags({ roleId, talentId });
}

export async function fetchOpsMatchingTalentTags(args: {
  roleId?: string | null;
  talentId: string;
}): Promise<OpsMatchingTalentTag[]> {
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  if (!talentId) return [];

  const admin = getSupabaseAdmin();
  let query = fromOpsMatchingTable(admin, "talent_opportunity_tag")
    .select("id, tag, updated_at")
    .eq("talent_id", talentId)
    .order("updated_at", { ascending: false });
  query = roleId
    ? query.eq("opportunity_id", roleId)
    : query.is("opportunity_id", null);

  const { data, error } = await query;

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      return [];
    }
    throw new Error(error.message ?? "Failed to load tags");
  }

  return ((data ?? []) as Pick<TalentOpportunityTagRow, "id" | "tag">[]).map(
    (row) => ({ id: row.id, tag: row.tag })
  );
}

export async function setOpsMatchingReviewStage(args: {
  roleId: string;
  stage: unknown;
  talentId: string;
}): Promise<OpsMatchingReviewStageUpdateResponse> {
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  const stage = normalizeText(args.stage) as OpsMatchingReviewStageId;
  if (!roleId) throw new Error("roleId is required");
  if (!talentId) throw new Error("talentId is required");
  if (stage === "recommended") {
    throw new Error("recommended stage cannot be set manually");
  }

  const stageTag =
    MATCHING_REVIEW_STAGE_TAG_BY_STAGE[
      stage as keyof typeof MATCHING_REVIEW_STAGE_TAG_BY_STAGE
    ];
  if (!stageTag) throw new Error("Unsupported review stage");

  const admin = getSupabaseAdmin();
  const [existingResult, recommendation] = await Promise.all([
    fromOpsMatchingTable(admin, "talent_opportunity_tag")
      .select("id, tag")
      .eq("opportunity_id", roleId)
      .eq("talent_id", talentId),
    fetchLatestRecommendation({ admin, roleId, talentId }),
  ]);

  if (existingResult.error) {
    if (isMissingOpsMatchingTableError(existingResult.error)) {
      throw createMissingOpsMatchingTableError("talent_opportunity_tag");
    }
    throw new Error(
      existingResult.error.message ?? "Failed to load matching tags"
    );
  }

  const rows = (existingResult.data ?? []) as Pick<
    TalentOpportunityTagRow,
    "id" | "tag"
  >[];
  const previousStage = getOpsMatchingReviewStage({
    feedback: recommendation?.feedback,
    tags: rows.map((row) => ({ id: row.id, tag: row.tag })),
  }).stage;
  const internalStageTagIds = rows
    .filter((row) =>
      MATCHING_REVIEW_STAGE_TAG_KEYS.has(normalizeTagKey(row.tag))
    )
    .map((row) => row.id)
    .filter(Boolean);

  if (internalStageTagIds.length > 0) {
    const { error } = await fromOpsMatchingTable(
      admin,
      "talent_opportunity_tag"
    )
      .delete()
      .eq("opportunity_id", roleId)
      .eq("talent_id", talentId)
      .in("id", internalStageTagIds);

    if (error) {
      if (isMissingOpsMatchingTableError(error)) {
        throw createMissingOpsMatchingTableError("talent_opportunity_tag");
      }
      throw new Error(error.message ?? "Failed to update review stage");
    }
  }

  const { error } = await fromOpsMatchingTable(
    admin,
    "talent_opportunity_tag"
  ).insert({
    opportunity_id: roleId,
    tag: stageTag,
    talent_id: talentId,
    updated_at: new Date().toISOString(),
  });

  if (error && error.code !== "23505") {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("talent_opportunity_tag");
    }
    throw new Error(error.message ?? "Failed to update review stage");
  }

  if (previousStage !== stage) {
    const { error: progressError } = await fromOpsMatchingTable(
      admin,
      "talent_progress"
    ).insert({
      recommendation_id: recommendation?.recommendationId ?? null,
      role_id: roleId,
      talent_id: talentId,
      text: buildReviewStageProgressText({
        nextStage: stage as Exclude<OpsMatchingReviewStageId, "recommended">,
        previousStage,
      }),
      user_id: null,
    });

    if (progressError) {
      if (isMissingOpsMatchingTableError(progressError)) {
        throw createMissingOpsMatchingTableError("talent_progress");
      }
      throw new Error(
        progressError.message ?? "Failed to create review progress"
      );
    }
  }

  return {
    ok: true,
    roleId,
    stage: stage as Exclude<OpsMatchingReviewStageId, "recommended">,
    tags: await fetchOpsMatchingTalentTags({ roleId, talentId }),
    talentId,
  };
}

async function fetchLatestRecommendation(args: {
  admin: AdminClient;
  roleId: string;
  talentId: string;
}): Promise<OpsMatchingRecommendationSummary | null> {
  if (!args.roleId) return null;
  const { data, error } = await args.admin
    .from("talent_opportunity_recommendation")
    .select(
      "id, talent_id, role_id, discovery_run_id, processed_stage, feedback, feedback_at, feedback_reason, saved_stage, recommended_at, created_at, updated_at"
    )
    .eq("talent_id", args.talentId)
    .eq("role_id", args.roleId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed to load recommendation");
  }

  const row = (data ?? [])[0] as TalentRecommendationRow | undefined;
  if (!row) return null;
  const discoveryRunId = row.discovery_run_id ?? null;
  const [manualRunIds, deliveries] = await Promise.all([
    discoveryRunId
      ? fetchManualInternalRecommendationRunIds({
          admin: args.admin,
          runIds: [discoveryRunId],
        })
      : Promise.resolve(new Set<string>()),
    fetchRecommendationDeliveries({
      admin: args.admin,
      discoveryRunId,
      talentId: args.talentId,
    }),
  ]);

  return {
    createdAt: row.created_at,
    deliveries,
    discoveryRunId,
    feedback: row.feedback,
    feedbackAt: row.feedback_at,
    feedbackReason: row.feedback_reason,
    isManualInternalRecommendation:
      discoveryRunId !== null && manualRunIds.has(discoveryRunId),
    processedStage: row.processed_stage,
    recommendationId: row.id,
    recommendedAt: row.recommended_at,
    roleId: row.role_id,
    savedStage: row.saved_stage,
    talentId: row.talent_id,
    updatedAt: row.updated_at,
  };
}

async function fetchRoleNameMap(args: {
  admin: AdminClient;
  roleIds: string[];
}) {
  const uniqueRoleIds = Array.from(new Set(args.roleIds.filter(Boolean)));
  const roleMap = new Map<string, CompanyRoleName>();
  if (uniqueRoleIds.length === 0) return roleMap;

  const { data: roleRows, error: roleError } = await args.admin
    .from("company_roles")
    .select("role_id, name, company_workspace_id")
    .in("role_id", uniqueRoleIds);

  if (roleError) {
    throw new Error(roleError.message ?? "Failed to load progress roles");
  }

  const workspaceIds = Array.from(
    new Set((roleRows ?? []).map((row) => row.company_workspace_id))
  );
  const companyMap = new Map<string, string>();
  if (workspaceIds.length > 0) {
    const { data: workspaceRows, error: workspaceError } = await args.admin
      .from("company_workspace")
      .select("company_workspace_id, company_name")
      .in("company_workspace_id", workspaceIds);

    if (workspaceError) {
      throw new Error(workspaceError.message ?? "Failed to load companies");
    }

    for (const row of workspaceRows ?? []) {
      companyMap.set(row.company_workspace_id, row.company_name);
    }
  }

  for (const row of roleRows ?? []) {
    roleMap.set(row.role_id, {
      companyName: companyMap.get(row.company_workspace_id) ?? null,
      roleName: row.name,
    });
  }

  return roleMap;
}

async function fetchRoleContextMap(args: {
  admin: AdminClient;
  roleIds: string[];
}) {
  const uniqueRoleIds = Array.from(new Set(args.roleIds.filter(Boolean)));
  const roleMap = new Map<string, CompanyRoleContext>();
  if (uniqueRoleIds.length === 0) return roleMap;

  const roleRows: Array<{
    company_workspace_id: string;
    location_text: string | null;
    name: string;
    role_id: string;
    status: string | null;
    updated_at: string | null;
  }> = [];
  for (const chunk of chunkValues(uniqueRoleIds)) {
    const { data, error } = await args.admin
      .from("company_roles")
      .select(
        "role_id, name, company_workspace_id, location_text, status, updated_at"
      )
      .in("role_id", chunk);

    if (error) {
      throw new Error(error.message ?? "Failed to load matching roles");
    }

    roleRows.push(...(data ?? []));
  }

  const workspaceIds = Array.from(
    new Set(roleRows.map((row) => row.company_workspace_id).filter(Boolean))
  );
  const companyMap = new Map<string, string>();
  for (const chunk of chunkValues(workspaceIds)) {
    const { data, error } = await args.admin
      .from("company_workspace")
      .select("company_workspace_id, company_name")
      .in("company_workspace_id", chunk);

    if (error) {
      throw new Error(error.message ?? "Failed to load companies");
    }

    for (const row of data ?? []) {
      companyMap.set(row.company_workspace_id, row.company_name);
    }
  }

  for (const row of roleRows) {
    roleMap.set(row.role_id, {
      companyName: companyMap.get(row.company_workspace_id) ?? null,
      companyWorkspaceId: row.company_workspace_id,
      locationText: row.location_text,
      roleName: row.name,
      status: row.status,
      updatedAt: row.updated_at,
    });
  }

  return roleMap;
}

async function fetchRecommendationDeliveries(args: {
  admin: AdminClient;
  discoveryRunId: string | null;
  talentId: string;
}): Promise<OpsMatchingRecommendationDelivery[]> {
  const discoveryRunId = normalizeText(args.discoveryRunId);
  const talentId = normalizeText(args.talentId);
  if (!discoveryRunId || !talentId) return [];

  const { data, error } = await args.admin
    .from("talent_opportunity_delivery")
    .select("id, talent_id, channel, status, payload, sent_at, created_at")
    .eq("talent_id", talentId)
    .eq("discovery_run_id", discoveryRunId)
    .order("created_at", { ascending: false })
    .limit(MAX_MATCHING_RECOMMENDATION_DELIVERY_ITEMS);

  if (error) {
    throw new Error(error.message ?? "Failed to load recommendation delivery");
  }

  return ((data ?? []) as TalentOpportunityDeliveryRow[]).map((row) => {
    const payload = parseJsonRecord(row.payload);
    return {
      bodyText:
        getJsonString(payload, "textBody") ??
        getJsonString(payload, "emailBody") ??
        getJsonString(payload, "message") ??
        getJsonString(payload, "chatMessage"),
      channel: row.channel,
      createdAt: row.created_at,
      id: row.id,
      sentAt: row.sent_at,
      status: row.status,
      subject:
        getJsonString(payload, "subject") ??
        getJsonString(payload, "emailSubject"),
      toEmail: getJsonString(payload, "toEmail"),
    };
  });
}

export async function fetchOpsMatchingTalentRoleTags(args: {
  talentId: string;
}): Promise<OpsMatchingTalentRoleTagsResponse> {
  const talentId = normalizeText(args.talentId);
  if (!talentId) throw new Error("talentId is required");

  const admin = getSupabaseAdmin();
  const { data, error } = await fromOpsMatchingTable(
    admin,
    "talent_opportunity_tag"
  )
    .select("id, opportunity_id, tag, updated_at")
    .eq("talent_id", talentId)
    .order("updated_at", { ascending: false })
    .limit(MAX_MATCHING_TALENT_ROLE_TAG_ROWS);

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      return { items: [], talentId, talentTags: [] };
    }
    throw new Error(error.message ?? "Failed to load matching tags");
  }

  const grouped = new Map<
    string,
    {
      tags: OpsMatchingTalentTag[];
      updatedAt: string | null;
    }
  >();
  const talentTags: OpsMatchingTalentTag[] = [];
  for (const row of (data ?? []) as Pick<
    TalentOpportunityTagRow,
    "id" | "opportunity_id" | "tag" | "updated_at"
  >[]) {
    const roleId = normalizeText(row.opportunity_id);
    if (!roleId) {
      talentTags.push({ id: row.id, tag: row.tag });
      continue;
    }
    const current = grouped.get(roleId) ?? {
      tags: [],
      updatedAt: row.updated_at ?? null,
    };
    current.tags.push({ id: row.id, tag: row.tag });
    if (!current.updatedAt || row.updated_at > current.updatedAt) {
      current.updatedAt = row.updated_at;
    }
    grouped.set(roleId, current);
  }

  const roleIds = Array.from(grouped.keys());
  const roleMap = await fetchRoleContextMap({ admin, roleIds });

  return {
    items: roleIds
      .map((roleId) => {
        const group = grouped.get(roleId);
        const role = roleMap.get(roleId);
        return {
          companyName: role?.companyName ?? null,
          companyWorkspaceId: role?.companyWorkspaceId ?? null,
          locationText: role?.locationText ?? null,
          roleId,
          roleName: role?.roleName ?? null,
          status: role?.status ?? null,
          tags: group?.tags ?? [],
          updatedAt: group?.updatedAt ?? role?.updatedAt ?? null,
        } satisfies OpsMatchingTalentRoleTagGroup;
      })
      .sort((left, right) => {
        const leftTime = Date.parse(left.updatedAt ?? "");
        const rightTime = Date.parse(right.updatedAt ?? "");
        const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
        const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;
        if (safeLeftTime !== safeRightTime) {
          return safeRightTime - safeLeftTime;
        }
        return left.roleId.localeCompare(right.roleId);
      }),
    talentId,
    talentTags,
  };
}

export async function fetchOpsMatchingProgress(args: {
  roleId?: string | null;
  talentId: string;
}): Promise<OpsMatchingProgressResponse> {
  const talentId = normalizeText(args.talentId);
  const roleId = normalizeText(args.roleId);
  if (!talentId) throw new Error("talentId is required");

  const admin = getSupabaseAdmin();
  let query = fromOpsMatchingTable(admin, "talent_progress")
    .select(
      "id, talent_id, role_id, recommendation_id, text, user_id, created_at"
    )
    .eq("talent_id", talentId)
    .order("created_at", { ascending: false })
    .limit(MAX_MATCHING_PROGRESS_ITEMS);

  if (roleId) {
    query = query.eq("role_id", roleId);
  }

  const [progressResult, recommendation] = await Promise.all([
    query,
    roleId
      ? fetchLatestRecommendation({ admin, roleId, talentId })
      : Promise.resolve(null),
  ]);

  if (
    progressResult.error &&
    !isMissingOpsMatchingTableError(progressResult.error)
  ) {
    throw new Error(
      progressResult.error.message ?? "Failed to load talent progress"
    );
  }

  const rows = progressResult.error
    ? []
    : ((progressResult.data ?? []) as TalentProgressRow[]);
  const roleMap = await fetchRoleNameMap({
    admin,
    roleIds: [
      ...rows.map((row) => row.role_id),
      recommendation?.roleId ?? "",
      roleId,
    ],
  });

  return {
    items: rows.map((row) => {
      const role = roleMap.get(row.role_id);
      return {
        companyName: role?.companyName ?? null,
        createdAt: row.created_at,
        id: row.id,
        recommendationId: row.recommendation_id,
        roleId: row.role_id,
        roleName: role?.roleName ?? null,
        talentId: row.talent_id,
        text: row.text,
        userId: row.user_id,
      };
    }),
    recommendation,
    roleId: roleId || null,
    talentId,
  };
}

export async function createOpsMatchingProgress(args: {
  roleId: string;
  talentId: string;
  text: unknown;
}) {
  const talentId = normalizeText(args.talentId);
  const roleId = normalizeText(args.roleId);
  const text = normalizeText(args.text).slice(
    0,
    MAX_MATCHING_PROGRESS_TEXT_LENGTH
  );
  if (!talentId) throw new Error("talentId is required");
  if (!roleId) throw new Error("roleId is required");
  if (!text) throw new Error("text is required");

  const admin = getSupabaseAdmin();
  const recommendation = await fetchLatestRecommendation({
    admin,
    roleId,
    talentId,
  });

  const { error } = await fromOpsMatchingTable(admin, "talent_progress").insert(
    {
      recommendation_id: recommendation?.recommendationId ?? null,
      role_id: roleId,
      talent_id: talentId,
      text,
      user_id: null,
    }
  );

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("talent_progress");
    }
    throw new Error(error.message ?? "Failed to create talent progress");
  }

  return fetchOpsMatchingProgress({ roleId, talentId });
}

export async function deleteOpsMatchingProgress(args: {
  progressId: string;
  roleId?: string | null;
  talentId: string;
}): Promise<OpsMatchingProgressDeleteResponse> {
  const progressId = normalizeText(args.progressId);
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  if (!progressId) throw new Error("progressId is required");
  if (!talentId) throw new Error("talentId is required");

  const admin = getSupabaseAdmin();
  let query = fromOpsMatchingTable(admin, "talent_progress")
    .delete()
    .eq("id", progressId)
    .eq("talent_id", talentId);

  if (roleId) {
    query = query.eq("role_id", roleId);
  }

  const { data, error } = await query.select("id, role_id, talent_id");

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("talent_progress");
    }
    throw new Error(error.message ?? "Failed to delete talent progress");
  }

  const deleted = (data ?? [])[0] as
    | Pick<TalentProgressRow, "id" | "role_id" | "talent_id">
    | undefined;
  if (!deleted) {
    throw new Error("Progress를 찾을 수 없습니다.");
  }

  return {
    ok: true,
    progressId: deleted.id,
    roleId: deleted.role_id,
    talentId: deleted.talent_id,
  };
}
