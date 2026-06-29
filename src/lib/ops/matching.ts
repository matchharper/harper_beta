import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getInsightLabel } from "@/lib/talentOnboarding/insightChecklist";
import {
  isOpsMatchingExcludeNotInterestedFilter,
  isOpsMatchingNoHumanLabelFilter,
  isOpsMatchingNoTagFilter,
  OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE,
} from "@/lib/ops/matchingFilters";
import type { Database } from "@/types/database.types";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;
type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  | "created_at"
  | "email"
  | "headline"
  | "last_logined_at"
  | "name"
  | "profile_picture"
  | "resume_file_name"
  | "resume_links"
  | "resume_storage_path"
  | "user_id"
>;
type TalentExperienceRow = Pick<
  Database["public"]["Tables"]["talent_experiences"]["Row"],
  | "company_name"
  | "description"
  | "employment_type"
  | "end_date"
  | "id"
  | "role"
  | "start_date"
  | "talent_id"
>;
type TalentEducationRow = Pick<
  Database["public"]["Tables"]["talent_educations"]["Row"],
  | "degree"
  | "description"
  | "end_date"
  | "field"
  | "id"
  | "school"
  | "start_date"
  | "talent_id"
  | "url"
>;
type TalentExtraRow = Pick<
  Database["public"]["Tables"]["talent_extras"]["Row"],
  "content" | "talent_id"
>;
type TalentInsightRow = Pick<
  Database["public"]["Tables"]["talent_insights"]["Row"],
  "content" | "talent_id"
>;
type TalentOpportunityTagRow = {
  created_at: string;
  id: string;
  opportunity_id: string | null;
  tag: string;
  talent_id: string;
  updated_at: string;
};
type OpsMatchingRoleStageRow = Pick<
  Database["public"]["Tables"]["ops_matching_role_stages"]["Row"],
  "id" | "label" | "role_id" | "sort_order"
>;
type TalentOpportunityDeliveryRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_delivery"]["Row"],
  | "channel"
  | "created_at"
  | "discovery_run_id"
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
  | "viewed_at"
>;
type TalentRecommendationForFitRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  | "created_at"
  | "discovery_run_id"
  | "id"
  | "recommended_at"
  | "role_id"
  | "talent_id"
>;
type TalentRecommendationHistoryRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  | "created_at"
  | "discovery_run_id"
  | "feedback"
  | "feedback_at"
  | "feedback_reason"
  | "fit_summary"
  | "id"
  | "processed_stage"
  | "recommended_at"
  | "role_id"
  | "saved_stage"
  | "score"
  | "talent_id"
  | "updated_at"
>;
type TalentOpportunityFitRecordRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_fit"]["Row"],
  | "created_at"
  | "human_label"
  | "human_reason"
  | "human_reviewed_at"
  | "human_reviewed_by"
  | "id"
  | "label"
  | "last_evaluated_at"
  | "opportunity_id"
  | "reason"
  | "reevaluation_checked_at"
  | "reevaluation_criteria"
  | "score"
  | "talent_id"
>;

const DEFAULT_MATCHING_TALENT_LIMIT = 20;
const MAX_MATCHING_TALENT_LIMIT = 50;
const MAX_MATCHING_COMPANY_OPTIONS = 500;
const MAX_MATCHING_ROLE_OPTIONS = 500;
const MAX_MATCHING_PROGRESS_ITEMS = 120;
const MAX_MATCHING_REVIEW_ITEMS = 500;
const MAX_MATCHING_TAG_LENGTH = 40;
const MAX_MATCHING_TAG_OPTION_ROWS = 5000;
const MAX_MATCHING_ROLE_STAGE_LABEL_LENGTH = 40;
const MAX_MATCHING_NO_TAG_SCAN_ROWS = 5000;
const MAX_MATCHING_TALENT_ROLE_TAG_ROWS = 5000;
const MAX_MATCHING_FIT_SEARCH_IDS = 500;
const MAX_MATCHING_FIT_RECOMMENDATION_ROWS = 1000;
const MAX_MATCHING_PROGRESS_TEXT_LENGTH = 2000;
const MAX_MATCHING_RECOMMENDATION_DELIVERY_ITEMS = 5;
const MAX_MATCHING_TALENT_DETAIL_FIT_ROWS = 5000;
const MATCHING_TALENT_DETAIL_FIT_PAGE_SIZE = 1000;
const MAX_MATCHING_TALENT_HISTORY_ITEMS = 5;
const MAX_MATCHING_TALENT_HISTORY_ROWS = 1000;
const MAX_MATCHING_TALENT_HISTORY_TALENTS = 100;
const MATCHING_ID_FILTER_CHUNK_SIZE = 80;
const OPS_MATCHING_FIT_LABELS = [
  "ambiguous",
  "dissatisfied",
  "fit",
  "hold",
  "unfit",
] as const;
const OPS_MATCHING_FIT_LABEL_SET = new Set<string>(OPS_MATCHING_FIT_LABELS);
const OPS_MATCHING_TALENT_HISTORY_SECTIONS = [
  "external_positive",
  "internal_recommendations",
] as const;
const OPS_MATCHING_TALENT_HISTORY_SECTION_SET = new Set<string>(
  OPS_MATCHING_TALENT_HISTORY_SECTIONS
);
const ACTIVE_ROLE_STATUSES = new Set(["active", "top_priority"]);
const CUSTOM_REVIEW_STAGE_ID_PREFIX = "custom:";
const CUSTOM_REVIEW_STAGE_TAG_PREFIX = "내부단계:";
const MATCHING_REVIEW_STAGE_TAG_BY_STAGE = {
  accepted: "내부:수락",
  archived: "내부:아카이브",
  final_offer: "내부:최종오퍼",
  hold: "내부:보류",
  pending_connection: "내부:연결대기",
  process_stopped: "내부:프로세스중단",
  rejected: "내부:거절",
} as const;
const MATCHING_REVIEW_STAGE_LABEL_BY_STAGE: Record<
  OpsMatchingBuiltInReviewStageId,
  string
> = {
  accepted: "수락",
  archived: "아카이브",
  final_offer: "최종 오퍼",
  hold: "보류",
  pending_connection: "연결 대기",
  process_stopped: "프로세스 중단",
  recommended: "추천된 사람",
  rejected: "거절",
};
const MATCHING_NOT_INTERESTED_TAG = "관심없음";
const TALENT_POOL_TAILORED_TAG = "적합";

const TALENT_LIST_SELECT =
  "user_id, name, email, profile_picture, headline, created_at, last_logined_at, resume_file_name, resume_storage_path, resume_links";

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
  description: string | null;
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

export type OpsMatchingProfileExperience = {
  companyName: string | null;
  description: string | null;
  employmentType: string | null;
  period: string | null;
  role: string | null;
};

export type OpsMatchingProfileEducation = {
  degree: string | null;
  description: string | null;
  field: string | null;
  period: string | null;
  school: string | null;
  url: string | null;
};

export type OpsMatchingProfileExtra = {
  date: string | null;
  description: string | null;
  title: string | null;
};

export type OpsMatchingTalentInsight = {
  key: string;
  label: string;
  value: string;
};

export type OpsMatchingRecommendationResponseStatus =
  | "accepted"
  | "no_response"
  | "rejected";

export type OpsMatchingTalentHistorySection =
  (typeof OPS_MATCHING_TALENT_HISTORY_SECTIONS)[number];

export type OpsMatchingTalentExternalPositiveOpportunity = {
  companyName: string | null;
  feedback: string | null;
  feedbackAt: string | null;
  feedbackReason: string | null;
  fitSummary: string | null;
  recommendationId: string;
  recommendedAt: string;
  responseStatus: OpsMatchingRecommendationResponseStatus;
  roleId: string;
  roleName: string | null;
  score: number | null;
};

export type OpsMatchingTalentInternalRecommendationHistoryItem = {
  companyName: string | null;
  discoveryRunId: string | null;
  feedback: string | null;
  feedbackAt: string | null;
  feedbackReason: string | null;
  fitSummary: string | null;
  recommendationId: string;
  recommendedAt: string;
  responseStatus: OpsMatchingRecommendationResponseStatus;
  roleId: string;
  roleName: string | null;
  score: number | null;
};

export type OpsMatchingTalentHistoryItem = {
  externalPositiveOpportunities: OpsMatchingTalentExternalPositiveOpportunity[];
  internalRecommendations: OpsMatchingTalentInternalRecommendationHistoryItem[];
  talentId: string;
};

export type OpsMatchingTalentHistoryResponse = {
  items: OpsMatchingTalentHistoryItem[];
  talentIds: string[];
};

export type OpsMatchingTalentTag = {
  id: string;
  tag: string;
};

export type OpsMatchingTagOption = {
  count: number;
  tag: string;
  updatedAt: string | null;
};

export type OpsMatchingTagOptionsResponse = {
  items: OpsMatchingTagOption[];
};

export type OpsMatchingTalentFitSummary = {
  createdAt: string;
  effectiveLabel: string;
  fitId: string;
  humanLabel: string | null;
  humanReason: string | null;
  humanReviewedAt: string | null;
  humanReviewedBy: string | null;
  label: string;
  lastEvaluatedAt: string | null;
  manualInternalRecommendationQueuedAt: string | null;
  recommendation: OpsMatchingFitRecommendation | null;
  reason: string;
  reevaluationCheckedAt: string | null;
  reevaluationCriteria: TalentOpportunityFitRecordRow["reevaluation_criteria"];
  score: number | null;
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
  experiences: OpsMatchingProfileExperience[];
  fit: OpsMatchingTalentFitSummary | null;
  hasSubmittedMaterial: boolean;
  headline: string | null;
  insights: OpsMatchingTalentInsight[];
  isOnboardingDone: boolean;
  educations: OpsMatchingProfileEducation[];
  extras: OpsMatchingProfileExtra[];
  latestCompany: OpsMatchingProfileLabel | null;
  latestSchool: OpsMatchingProfileLabel | null;
  lastLoginedAt: string | null;
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

export type OpsMatchingTalentPoolTabId = "all" | "tailored";

export type OpsMatchingTalentPoolListResponse =
  OpsMatchingTalentListResponse & {
    tab: OpsMatchingTalentPoolTabId;
  };

export type OpsMatchingBuiltInReviewStageId =
  | "accepted"
  | "archived"
  | "final_offer"
  | "hold"
  | "pending_connection"
  | "process_stopped"
  | "recommended"
  | "rejected";

export type OpsMatchingCustomReviewStageId =
  `${typeof CUSTOM_REVIEW_STAGE_ID_PREFIX}${string}`;

export type OpsMatchingReviewStageId =
  | OpsMatchingBuiltInReviewStageId
  | OpsMatchingCustomReviewStageId;

export type OpsMatchingRecommendationSummary = {
  companyName: string | null;
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
  roleName: string | null;
  savedStage: string | null;
  sourceType: string | null;
  talentId: string;
  updatedAt: string;
  viewedAt: string | null;
  workspaceIsInternal: boolean | null;
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
  viewedAt: string | null;
};

export type OpsMatchingRoleReviewStage = {
  id: string;
  label: string;
  roleId: string;
  sortOrder: number;
  stage: OpsMatchingCustomReviewStageId;
};

export type OpsMatchingReviewBoardResponse = {
  customStages: OpsMatchingRoleReviewStage[];
  items: OpsMatchingReviewItem[];
  roleId: string;
  totalCount: number;
};

export type OpsMatchingFitRole = {
  companyName: string | null;
  companyWorkspaceId: string | null;
  locationText: string | null;
  roleId: string;
  roleName: string | null;
  status: string | null;
  updatedAt: string | null;
};

export type OpsMatchingFitLabel = (typeof OPS_MATCHING_FIT_LABELS)[number];
export type OpsMatchingHumanLabelFilter =
  | OpsMatchingFitLabel
  | typeof OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE;

export type OpsMatchingFitRecommendation = {
  createdAt: string;
  isManualInternalRecommendation: boolean;
  recommendationId: string;
  recommendedAt: string;
};

export type OpsMatchingFitItem = {
  createdAt: string;
  effectiveLabel: string;
  fitId: string;
  humanLabel: string | null;
  humanReason: string | null;
  humanReviewedAt: string | null;
  humanReviewedBy: string | null;
  label: string;
  lastEvaluatedAt: string;
  manualInternalRecommendationQueuedAt: string | null;
  reason: string;
  recommendation: OpsMatchingFitRecommendation | null;
  reevaluationCheckedAt: string | null;
  reevaluationCriteria: TalentOpportunityFitRecordRow["reevaluation_criteria"];
  role: OpsMatchingFitRole;
  score: number;
  talent: OpsMatchingTalentItem;
};

export type OpsMatchingFitListResponse = {
  hasMore: boolean;
  items: OpsMatchingFitItem[];
  limit: number;
  nextOffset: number | null;
  offset: number;
  totalCount: number;
};

export type OpsMatchingTalentFitsResponse = {
  items: OpsMatchingFitItem[];
  talentId: string;
  totalCount: number;
};

export type OpsMatchingReviewStageUpdateResponse = {
  ok: true;
  roleId: string;
  stage: Exclude<OpsMatchingReviewStageId, "recommended">;
  tags: OpsMatchingTalentTag[];
  talentId: string;
};

export type OpsMatchingRoleReviewStageCreateResponse = {
  ok: true;
  roleId: string;
  stage: OpsMatchingRoleReviewStage;
};

export type OpsMatchingRoleReviewStageUpdateResponse =
  OpsMatchingRoleReviewStageCreateResponse;

export type OpsMatchingRoleReviewStageDeleteResponse = {
  ok: true;
  roleId: string;
  stageId: string;
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
  fit: OpsMatchingTalentFitSummary | null;
  items: OpsMatchingProgressItem[];
  recommendation: OpsMatchingRecommendationSummary | null;
  recommendations: OpsMatchingRecommendationSummary[];
  roleId: string | null;
  talentId: string;
};

export type OpsMatchingProgressDeleteResponse = {
  ok: true;
  progressId: string;
  roleId: string;
  talentId: string;
};

export type OpsMatchingFitHumanLabelUpdateResponse = {
  effectiveLabel: string;
  fitId: string;
  humanLabel: OpsMatchingFitLabel | null;
  humanReason: string | null;
  humanReviewedAt: string | null;
  humanReviewedBy: string | null;
};

type DateRange = {
  endExclusiveIso: string | null;
  startIso: string | null;
};

type CompanyRoleName = {
  companyName: string | null;
  roleName: string | null;
  sourceType: string | null;
  workspaceIsInternal: boolean | null;
};

type CompanyRoleContext = CompanyRoleName & {
  companyWorkspaceId: string | null;
  locationText: string | null;
  status: string | null;
  updatedAt: string | null;
};

function isInternalCompanyRole(role: CompanyRoleName | null | undefined) {
  return (
    normalizeText(role?.sourceType).toLowerCase() === "internal" ||
    role?.workspaceIsInternal === true
  );
}

function fromOpsMatchingTable<
  TTableName extends
    | "ops_matching_role_stages"
    | "talent_opportunity_fit"
    | "talent_opportunity_tag"
    | "talent_progress",
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
    (message.includes("ops_matching_role_stages") ||
      message.includes("talent_opportunity_tag") ||
      message.includes("talent_opportunity_fit") ||
      message.includes("talent_progress")) &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("not found"))
  );
}

function createMissingOpsMatchingTableError(tableName: string) {
  return new Error(
    `${tableName} 테이블이 없습니다. 최신 supabase migration을 적용해 주세요.`
  );
}

function normalizeTag(value: unknown) {
  return normalizeText(value).slice(0, MAX_MATCHING_TAG_LENGTH);
}

function normalizeTagKey(value: unknown) {
  return normalizeTag(value).toLowerCase();
}

function normalizeStageTagKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function buildCustomReviewStageId(
  stageId: string
): OpsMatchingCustomReviewStageId {
  return `${CUSTOM_REVIEW_STAGE_ID_PREFIX}${stageId}` as OpsMatchingCustomReviewStageId;
}

function getCustomReviewStageDbId(stage: string) {
  return stage.startsWith(CUSTOM_REVIEW_STAGE_ID_PREFIX)
    ? normalizeText(stage.slice(CUSTOM_REVIEW_STAGE_ID_PREFIX.length))
    : "";
}

function buildCustomReviewStageTag(stageId: string) {
  return `${CUSTOM_REVIEW_STAGE_TAG_PREFIX}${normalizeText(stageId).replace(/-/g, "").toLowerCase()}`;
}

function isCustomReviewStageTag(tag: unknown) {
  return normalizeStageTagKey(tag).startsWith(
    normalizeStageTagKey(CUSTOM_REVIEW_STAGE_TAG_PREFIX)
  );
}

const MATCHING_REVIEW_STAGE_BY_TAG_KEY = new Map(
  Object.entries(MATCHING_REVIEW_STAGE_TAG_BY_STAGE).map(([stage, tag]) => [
    normalizeStageTagKey(tag),
    stage as Exclude<OpsMatchingReviewStageId, "recommended">,
  ])
);

const MATCHING_REVIEW_STAGE_TAG_KEYS = new Set(
  Object.values(MATCHING_REVIEW_STAGE_TAG_BY_STAGE).map(normalizeStageTagKey)
);

function isInternalReviewStageTag(tag: unknown) {
  const tagKey = normalizeStageTagKey(tag);
  return (
    MATCHING_REVIEW_STAGE_TAG_KEYS.has(tagKey) || isCustomReviewStageTag(tag)
  );
}

function buildCustomReviewStageByTagKey(
  customStages: readonly OpsMatchingRoleReviewStage[]
) {
  return new Map(
    customStages.map((stage) => [
      normalizeStageTagKey(buildCustomReviewStageTag(stage.id)),
      stage.stage,
    ])
  );
}

function buildReviewStageLabelMap(
  customStages: readonly OpsMatchingRoleReviewStage[]
) {
  return new Map<OpsMatchingReviewStageId, string>(
    customStages.map((stage) => [stage.stage, stage.label])
  );
}

function getReviewStageLabel(
  stage: OpsMatchingReviewStageId,
  customStageLabelByStage?: ReadonlyMap<OpsMatchingReviewStageId, string>
) {
  if (stage in MATCHING_REVIEW_STAGE_LABEL_BY_STAGE) {
    return MATCHING_REVIEW_STAGE_LABEL_BY_STAGE[
      stage as OpsMatchingBuiltInReviewStageId
    ];
  }
  return customStageLabelByStage?.get(stage) ?? "커스텀 단계";
}

function isAcceptedFeedback(feedback: string | null | undefined) {
  const normalized = normalizeText(feedback).toLowerCase();
  return normalized === "like" || normalized === "positive";
}

function isRejectedFeedback(feedback: string | null | undefined) {
  const normalized = normalizeText(feedback).toLowerCase();
  return normalized === "dislike" || normalized === "negative";
}

function getOpsMatchingReviewStage(args: {
  customStageByTagKey?: ReadonlyMap<string, OpsMatchingCustomReviewStageId>;
  feedback: string | null | undefined;
  tags: OpsMatchingTalentTag[];
}): { stage: OpsMatchingReviewStageId; stageTag: string | null } {
  for (const tag of args.tags) {
    const tagKey = normalizeStageTagKey(tag.tag);
    const stage = MATCHING_REVIEW_STAGE_BY_TAG_KEY.get(tagKey);
    if (stage) return { stage, stageTag: tag.tag };
    const customStage = args.customStageByTagKey?.get(tagKey);
    if (customStage) return { stage: customStage, stageTag: tag.tag };
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
  customStageLabelByStage?: ReadonlyMap<OpsMatchingReviewStageId, string>;
  nextStage: Exclude<OpsMatchingReviewStageId, "recommended">;
  previousStage: OpsMatchingReviewStageId;
}) {
  const nextLabel = getReviewStageLabel(
    args.nextStage,
    args.customStageLabelByStage
  );
  const previousLabel = getReviewStageLabel(
    args.previousStage,
    args.customStageLabelByStage
  );
  if (args.previousStage === "recommended") {
    return `${nextLabel}로 옮겼습니다.`;
  }
  return `${previousLabel}에서 ${nextLabel}로 옮겼습니다.`;
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

function normalizePrimitiveText(value: unknown) {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return null;
  }
  return normalizeNullableText(String(value));
}

function getRecordPrimitiveText(
  record: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const text = normalizePrimitiveText(record[key]);
    if (text) return text;
  }
  return null;
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

export function parseOpsMatchingFitLabels(value: string | null) {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(",")
        .map((label) => normalizeText(label).toLowerCase())
        .filter((label): label is OpsMatchingFitLabel =>
          OPS_MATCHING_FIT_LABEL_SET.has(label)
        )
    )
  );
}

export function parseOpsMatchingHumanLabelFilters(
  value: string | null
): OpsMatchingHumanLabelFilter[] {
  const seen = new Set<string>();
  const labels: OpsMatchingHumanLabelFilter[] = [];

  for (const rawLabel of String(value ?? "").split(",")) {
    const normalized = normalizeText(rawLabel).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;

    if (isOpsMatchingNoHumanLabelFilter(normalized)) {
      seen.add(normalized);
      labels.push(OPS_MATCHING_NO_HUMAN_LABEL_FILTER_VALUE);
      continue;
    }

    if (OPS_MATCHING_FIT_LABEL_SET.has(normalized)) {
      seen.add(normalized);
      labels.push(normalized as OpsMatchingFitLabel);
    }
  }

  return labels;
}

export function parseOpsMatchingTalentHistorySections(
  value: string | null
): OpsMatchingTalentHistorySection[] {
  const seen = new Set<string>();
  const sections: OpsMatchingTalentHistorySection[] = [];

  for (const rawSection of String(value ?? "").split(",")) {
    const section = normalizeText(rawSection).toLowerCase();
    if (!section || seen.has(section)) continue;
    if (!OPS_MATCHING_TALENT_HISTORY_SECTION_SET.has(section)) continue;
    seen.add(section);
    sections.push(section as OpsMatchingTalentHistorySection);
  }

  return sections;
}

export function parseOpsMatchingTalentIds(value: string | null) {
  const seen = new Set<string>();
  const talentIds: string[] = [];

  for (const rawTalentId of String(value ?? "").split(",")) {
    const talentId = normalizeText(rawTalentId);
    if (!talentId || seen.has(talentId)) continue;
    seen.add(talentId);
    talentIds.push(talentId);
    if (talentIds.length >= MAX_MATCHING_TALENT_HISTORY_TALENTS) break;
  }

  return talentIds;
}

export function parseOpsMatchingTalentPoolTab(
  value: string | null
): OpsMatchingTalentPoolTabId {
  const normalized = normalizeText(value);
  if (normalized === "all" || normalized === "tailored") {
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

function normalizeHumanLabelFilterState(
  values: readonly OpsMatchingHumanLabelFilter[] | undefined
) {
  const labels = Array.from(
    new Set(
      (values ?? []).filter(
        (label): label is OpsMatchingFitLabel =>
          !isOpsMatchingNoHumanLabelFilter(label) &&
          OPS_MATCHING_FIT_LABEL_SET.has(label)
      )
    )
  );
  const includeMissing = (values ?? []).some(isOpsMatchingNoHumanLabelFilter);
  return {
    includeMissing,
    labels,
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

function buildExperienceProfile(
  row: TalentExperienceRow
): OpsMatchingProfileExperience | null {
  const companyName = normalizeNullableText(row.company_name);
  const role = normalizeNullableText(row.role);
  const description = normalizeNullableText(row.description);
  const employmentType = normalizeNullableText(row.employment_type);
  const period = formatPeriod({
    endDate: row.end_date,
    startDate: row.start_date,
  });
  if (!companyName && !role && !description && !employmentType && !period) {
    return null;
  }
  return {
    companyName,
    description,
    employmentType,
    period,
    role,
  };
}

function buildEducationProfile(
  row: TalentEducationRow
): OpsMatchingProfileEducation | null {
  const degree = normalizeNullableText(row.degree);
  const description = normalizeNullableText(row.description);
  const field = normalizeNullableText(row.field);
  const period = formatPeriod({
    endDate: row.end_date,
    startDate: row.start_date,
  });
  const school = normalizeNullableText(row.school);
  const url = normalizeNullableText(row.url);
  if (!degree && !description && !field && !period && !school && !url) {
    return null;
  }
  return {
    degree,
    description,
    field,
    period,
    school,
    url,
  };
}

function getProfileExtraEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = parseJsonRecord(value);
  if (!record) return [];
  const listKeys = ["extras", "items", "projects", "activities"];
  for (const key of listKeys) {
    const list = record[key];
    if (Array.isArray(list)) return list;
  }
  return [record];
}

function normalizeProfileExtras(value: unknown): OpsMatchingProfileExtra[] {
  return getProfileExtraEntries(value)
    .map((entry) => {
      if (typeof entry === "string") {
        const description = normalizeNullableText(entry);
        return description ? { date: null, description, title: null } : null;
      }
      if (!isRecord(entry)) return null;
      const title = getRecordPrimitiveText(entry, ["title", "name", "label"]);
      const date = getRecordPrimitiveText(entry, ["date", "period", "year"]);
      const description = getRecordPrimitiveText(entry, [
        "description",
        "content",
        "text",
        "summary",
      ]);
      if (!title && !date && !description) return null;
      return { date, description, title };
    })
    .filter((extra): extra is OpsMatchingProfileExtra => extra !== null);
}

function formatInsightValue(value: unknown) {
  const primitiveText = normalizePrimitiveText(value);
  if (primitiveText) return primitiveText;
  if (Array.isArray(value)) {
    return value.map(normalizePrimitiveText).filter(Boolean).join(", ");
  }
  if (!isRecord(value)) return "";
  return (
    getRecordPrimitiveText(value, [
      "value",
      "answer",
      "description",
      "summary",
      "text",
    ]) ?? ""
  );
}

function normalizeTalentInsights(value: unknown): OpsMatchingTalentInsight[] {
  const record = parseJsonRecord(value);
  if (!record) return [];
  return Object.entries(record)
    .map(([key, rawValue]) => {
      const insightValue = formatInsightValue(rawValue);
      if (!insightValue) return null;
      return {
        key,
        label: getInsightLabel(key),
        value: insightValue,
      };
    })
    .filter((insight): insight is OpsMatchingTalentInsight => insight !== null);
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

function buildOpsMatchingTalentFitSummary(
  row: TalentOpportunityFitRecordRow,
  recommendationMap?: Map<string, OpsMatchingFitRecommendation>,
  queuedManualRecommendationMap?: Map<string, string>
): OpsMatchingTalentFitSummary {
  const label = normalizeText(row.label);
  const humanLabel = normalizeNullableText(row.human_label);
  const pairKey = getTalentRolePairKey({
    roleId: row.opportunity_id,
    talentId: row.talent_id,
  });
  return {
    createdAt: row.created_at,
    effectiveLabel: humanLabel || label,
    fitId: row.id,
    humanLabel,
    humanReason: normalizeNullableText(row.human_reason),
    humanReviewedAt: row.human_reviewed_at,
    humanReviewedBy: normalizeNullableText(row.human_reviewed_by),
    label,
    lastEvaluatedAt: row.last_evaluated_at,
    manualInternalRecommendationQueuedAt:
      queuedManualRecommendationMap?.get(pairKey) ?? null,
    recommendation: recommendationMap?.get(pairKey) ?? null,
    reason: normalizeText(row.reason),
    reevaluationCheckedAt: row.reevaluation_checked_at,
    reevaluationCriteria: row.reevaluation_criteria,
    score: typeof row.score === "number" ? row.score : null,
  };
}

function buildOpsMatchingTalentFitMap(
  rows: TalentOpportunityFitRecordRow[],
  recommendationMap?: Map<string, OpsMatchingFitRecommendation>,
  queuedManualRecommendationMap?: Map<string, string>
) {
  const fitMap = new Map<string, OpsMatchingTalentFitSummary>();
  for (const row of rows) {
    const talentId = normalizeText(row.talent_id);
    if (!talentId || fitMap.has(talentId)) continue;
    fitMap.set(
      talentId,
      buildOpsMatchingTalentFitSummary(
        row,
        recommendationMap,
        queuedManualRecommendationMap
      )
    );
  }
  return fitMap;
}

async function fetchSearchMatchedTalentIds(args: {
  admin: AdminClient;
  searchQuery: string;
}) {
  const talentIds = new Set<string>();
  const searchQuery = normalizeText(args.searchQuery);
  if (!searchQuery) return talentIds;
  const searchPattern = buildMatchingIlikePattern(searchQuery);

  const { data, error } = await args.admin
    .from("talent_users")
    .select("user_id")
    .or(`name.ilike.${searchPattern},email.ilike.${searchPattern}`)
    .limit(MAX_MATCHING_NO_TAG_SCAN_ROWS);

  if (error) {
    throw new Error(error.message ?? "Failed to search matching talents");
  }

  for (const row of data ?? []) {
    const talentId = normalizeText(row.user_id);
    if (talentId) talentIds.add(talentId);
  }

  return talentIds;
}

async function loadRoleFitRows(args: {
  admin: AdminClient;
  humanLabelMissing: boolean;
  humanLabels: OpsMatchingFitLabel[];
  limit: number;
  llmLabels: OpsMatchingFitLabel[];
  offset: number;
  roleId: string;
  scanForClientFilters: boolean;
}) {
  let fitQuery = fromOpsMatchingTable(args.admin, "talent_opportunity_fit")
    .select(
      "id, talent_id, opportunity_id, score, label, reason, reevaluation_criteria, human_label, human_reason, human_reviewed_by, human_reviewed_at, last_evaluated_at, reevaluation_checked_at, created_at",
      { count: args.scanForClientFilters ? undefined : "exact" }
    )
    .eq("opportunity_id", args.roleId);

  if (args.llmLabels.length > 0) {
    fitQuery = fitQuery.in("label", args.llmLabels);
  }
  if (args.humanLabelMissing && args.humanLabels.length > 0) {
    fitQuery = fitQuery.or(
      `human_label.is.null,human_label.in.(${args.humanLabels.join(",")})`
    );
  } else if (args.humanLabelMissing) {
    fitQuery = fitQuery.is("human_label", null);
  } else if (args.humanLabels.length > 0) {
    fitQuery = fitQuery.in("human_label", args.humanLabels);
  }

  const orderedQuery = fitQuery
    .order("last_evaluated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false });

  const { data, error, count } = args.scanForClientFilters
    ? await orderedQuery.limit(MAX_MATCHING_NO_TAG_SCAN_ROWS)
    : await orderedQuery.range(args.offset, args.offset + args.limit - 1);

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("talent_opportunity_fit");
    }
    throw new Error(error.message ?? "Failed to load role fit rows");
  }

  const rows = (data ?? []) as TalentOpportunityFitRecordRow[];
  return {
    rows,
    totalCount: args.scanForClientFilters
      ? rows.length
      : (count ?? rows.length),
  };
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
  const experienceMap = new Map<string, OpsMatchingProfileExperience[]>();
  const educationMap = new Map<string, OpsMatchingProfileEducation[]>();
  const extraMap = new Map<string, OpsMatchingProfileExtra[]>();
  if (args.talentIds.length === 0) {
    return { companyMap, educationMap, experienceMap, extraMap, schoolMap };
  }

  const [experienceResult, educationResult, extraResult] = await Promise.all([
    args.admin
      .from("talent_experiences")
      .select(
        "id, talent_id, company_name, role, employment_type, description, start_date, end_date"
      )
      .in("talent_id", args.talentIds)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }),
    args.admin
      .from("talent_educations")
      .select(
        "id, talent_id, school, degree, field, description, url, start_date, end_date"
      )
      .in("talent_id", args.talentIds)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }),
    args.admin
      .from("talent_extras")
      .select("talent_id, content")
      .in("talent_id", args.talentIds),
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
  if (extraResult.error) {
    throw new Error(
      extraResult.error.message ?? "Failed to load talent extras"
    );
  }

  for (const row of (experienceResult.data ?? []) as TalentExperienceRow[]) {
    const label = buildExperienceLabel(row);
    if (label) {
      const list = companyMap.get(row.talent_id) ?? [];
      list.push(label);
      companyMap.set(row.talent_id, list);
    }
    const experience = buildExperienceProfile(row);
    if (experience) {
      const list = experienceMap.get(row.talent_id) ?? [];
      list.push(experience);
      experienceMap.set(row.talent_id, list);
    }
  }

  for (const row of (educationResult.data ?? []) as TalentEducationRow[]) {
    const label = buildEducationLabel(row);
    if (label) {
      const list = schoolMap.get(row.talent_id) ?? [];
      list.push(label);
      schoolMap.set(row.talent_id, list);
    }
    const education = buildEducationProfile(row);
    if (education) {
      const list = educationMap.get(row.talent_id) ?? [];
      list.push(education);
      educationMap.set(row.talent_id, list);
    }
  }

  for (const row of (extraResult.data ?? []) as TalentExtraRow[]) {
    const extras = normalizeProfileExtras(row.content);
    if (extras.length > 0) {
      extraMap.set(row.talent_id, extras);
    }
  }

  return { companyMap, educationMap, experienceMap, extraMap, schoolMap };
}

async function fetchInsightMap(args: {
  admin: AdminClient;
  talentIds: string[];
}) {
  const insightMap = new Map<string, OpsMatchingTalentInsight[]>();
  if (args.talentIds.length === 0) return insightMap;

  const { data, error } = await args.admin
    .from("talent_insights")
    .select("talent_id, content")
    .in("talent_id", args.talentIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent insights");
  }

  for (const row of (data ?? []) as TalentInsightRow[]) {
    const talentId = normalizeText(row.talent_id);
    if (!talentId) continue;
    const nextInsights = normalizeTalentInsights(row.content);
    if (nextInsights.length === 0) continue;
    const existing = insightMap.get(talentId) ?? [];
    const existingKeys = new Set(existing.map((insight) => insight.key));
    const merged = [
      ...existing,
      ...nextInsights.filter((insight) => !existingKeys.has(insight.key)),
    ];
    insightMap.set(talentId, merged);
  }

  return insightMap;
}

function isPositiveRecommendationRow(row: TalentRecommendationHistoryRow) {
  return (
    isAcceptedFeedback(row.feedback) ||
    normalizeText(row.saved_stage) === "accepted" ||
    normalizeText(row.processed_stage) === "accepted"
  );
}

function getRecommendationPositiveSortTime(
  row: TalentRecommendationHistoryRow
) {
  return row.feedback_at ?? row.recommended_at ?? row.created_at;
}

function getRecommendationResponseStatus(
  row: TalentRecommendationHistoryRow
): OpsMatchingRecommendationResponseStatus {
  const savedStage = normalizeText(row.saved_stage).toLowerCase();
  const processedStage = normalizeText(row.processed_stage).toLowerCase();

  if (
    isAcceptedFeedback(row.feedback) ||
    savedStage === "accepted" ||
    processedStage === "accepted"
  ) {
    return "accepted";
  }

  if (
    isRejectedFeedback(row.feedback) ||
    savedStage === "rejected" ||
    savedStage === "archived" ||
    processedStage === "rejected" ||
    processedStage === "archived"
  ) {
    return "rejected";
  }

  return "no_response";
}

function buildExternalPositiveOpportunity(args: {
  role: CompanyRoleName | undefined;
  row: TalentRecommendationHistoryRow;
}): OpsMatchingTalentExternalPositiveOpportunity {
  return {
    companyName: args.role?.companyName ?? null,
    feedback: normalizeNullableText(args.row.feedback),
    feedbackAt: args.row.feedback_at,
    feedbackReason: normalizeNullableText(args.row.feedback_reason),
    fitSummary: normalizeNullableText(args.row.fit_summary),
    recommendationId: args.row.id,
    recommendedAt: args.row.recommended_at,
    responseStatus: getRecommendationResponseStatus(args.row),
    roleId: args.row.role_id,
    roleName: args.role?.roleName ?? null,
    score: typeof args.row.score === "number" ? args.row.score : null,
  };
}

function buildInternalRecommendationHistoryItem(args: {
  role: CompanyRoleName | undefined;
  row: TalentRecommendationHistoryRow;
}): OpsMatchingTalentInternalRecommendationHistoryItem {
  return {
    companyName: args.role?.companyName ?? null,
    discoveryRunId: args.row.discovery_run_id ?? null,
    feedback: normalizeNullableText(args.row.feedback),
    feedbackAt: args.row.feedback_at,
    feedbackReason: normalizeNullableText(args.row.feedback_reason),
    fitSummary: normalizeNullableText(args.row.fit_summary),
    recommendationId: args.row.id,
    recommendedAt: args.row.recommended_at,
    responseStatus: getRecommendationResponseStatus(args.row),
    roleId: args.row.role_id,
    roleName: args.role?.roleName ?? null,
    score: typeof args.row.score === "number" ? args.row.score : null,
  };
}

export async function fetchOpsMatchingTalentHistory(args: {
  sections?: OpsMatchingTalentHistorySection[];
  talentIds: string[];
}): Promise<OpsMatchingTalentHistoryResponse> {
  const talentIds = parseOpsMatchingTalentIds(args.talentIds.join(","));
  const sections = new Set(args.sections ?? []);
  const wantsExternalPositive = sections.has("external_positive");
  const wantsInternalRecommendations = sections.has("internal_recommendations");
  const itemMap = new Map<string, OpsMatchingTalentHistoryItem>(
    talentIds.map((talentId) => [
      talentId,
      {
        externalPositiveOpportunities: [],
        internalRecommendations: [],
        talentId,
      },
    ])
  );

  if (
    talentIds.length === 0 ||
    (!wantsExternalPositive && !wantsInternalRecommendations)
  ) {
    return {
      items: Array.from(itemMap.values()),
      talentIds,
    };
  }

  const admin = getSupabaseAdmin();
  let query = admin
    .from("talent_opportunity_recommendation")
    .select(
      "id, talent_id, role_id, discovery_run_id, feedback, feedback_at, feedback_reason, fit_summary, score, recommended_at, created_at, updated_at, processed_stage, saved_stage"
    )
    .in("talent_id", talentIds)
    .order("recommended_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(
      Math.max(
        50,
        Math.min(talentIds.length * 50, MAX_MATCHING_TALENT_HISTORY_ROWS)
      )
    );

  if (wantsExternalPositive && !wantsInternalRecommendations) {
    query = query.or(
      "feedback.in.(like,positive),saved_stage.eq.accepted,processed_stage.eq.accepted"
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message ?? "Failed to load matching talent history");
  }

  const rows = ((data ?? []) as TalentRecommendationHistoryRow[]).sort(
    (left, right) =>
      getRecommendationPositiveSortTime(right).localeCompare(
        getRecommendationPositiveSortTime(left)
      )
  );
  const manualRunIds = await fetchManualInternalRecommendationRunIds({
    admin,
    runIds: rows.map((row) => row.discovery_run_id ?? ""),
  });
  const roleIds = Array.from(
    new Set(rows.map((row) => normalizeText(row.role_id)).filter(Boolean))
  );
  const roleMap = await fetchRoleNameMap({ admin, roleIds });

  for (const row of rows) {
    const talentId = normalizeText(row.talent_id);
    const item = itemMap.get(talentId);
    if (!item) continue;
    const discoveryRunId = row.discovery_run_id ?? null;
    const isManualInternal =
      discoveryRunId !== null && manualRunIds.has(discoveryRunId);
    const role = roleMap.get(row.role_id);
    const isInternalRole = isInternalCompanyRole(role);
    const isInternalRecommendation = isInternalRole || isManualInternal;

    if (
      wantsExternalPositive &&
      !isInternalRecommendation &&
      isPositiveRecommendationRow(row) &&
      item.externalPositiveOpportunities.length <
        MAX_MATCHING_TALENT_HISTORY_ITEMS
    ) {
      item.externalPositiveOpportunities.push(
        buildExternalPositiveOpportunity({ role, row })
      );
    }

    if (
      wantsInternalRecommendations &&
      isInternalRecommendation &&
      item.internalRecommendations.length < MAX_MATCHING_TALENT_HISTORY_ITEMS
    ) {
      item.internalRecommendations.push(
        buildInternalRecommendationHistoryItem({ role, row })
      );
    }
  }

  return {
    items: Array.from(itemMap.values()),
    talentIds,
  };
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

  const sourceRows: TalentUserRow[] = [];
  const requiredIds = args.requiredTalentIds
    ? Array.from(args.requiredTalentIds).filter(Boolean)
    : [];

  if (requiredIds.length > 0) {
    for (
      let index = 0;
      index < requiredIds.length;
      index += MATCHING_ID_FILTER_CHUNK_SIZE
    ) {
      const chunk = requiredIds.slice(
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
        throw new Error(error.message ?? "Failed to load filtered talents");
      }
      sourceRows.push(...((data ?? []) as TalentUserRow[]));
    }
    sourceRows.sort(compareTalentRows);
  } else {
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
    sourceRows.push(...((data ?? []) as TalentUserRow[]));
  }

  const hasPositiveTagFilter =
    Boolean(args.matchedTagTalentIds) || args.includeNoTag;
  const rows = sourceRows.filter((row) => {
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
  fitMap?: Map<string, OpsMatchingTalentFitSummary>;
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
    insightMap,
    onboardingDoneMap,
  ] = await Promise.all([
    fetchMemoPreviewMap({ admin: args.admin, talentIds }),
    scopedTagsPromise,
    roleId
      ? fetchTagMap({ admin: args.admin, roleId: null, talentIds })
      : scopedTagsPromise,
    fetchProfileMaps({ admin: args.admin, talentIds }),
    fetchInsightMap({ admin: args.admin, talentIds }),
    fetchOnboardingDoneMap({ admin: args.admin, talentIds }),
  ]);

  return args.rows.map((row) => {
    const recentCompanies = profileMaps.companyMap.get(row.user_id) ?? [];
    const recentSchools = profileMaps.schoolMap.get(row.user_id) ?? [];
    return {
      createdAt: row.created_at,
      description: null,
      email: row.email,
      educations: profileMaps.educationMap.get(row.user_id) ?? [],
      experiences: profileMaps.experienceMap.get(row.user_id) ?? [],
      extras: profileMaps.extraMap.get(row.user_id) ?? [],
      fit: args.fitMap?.get(row.user_id) ?? null,
      hasSubmittedMaterial: hasSubmittedMaterial(row),
      headline: row.headline,
      insights: insightMap.get(row.user_id) ?? [],
      isOnboardingDone: onboardingDoneMap.get(row.user_id) ?? false,
      latestCompany: recentCompanies[0] ?? null,
      latestSchool: recentSchools[0] ?? null,
      lastLoginedAt: row.last_logined_at,
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
          "role_id, company_workspace_id, name, description, description_summary, location_text, source_type, status, updated_at"
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
    description: role.description,
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
  excludeRecommended?: boolean;
  humanLabels?: OpsMatchingHumanLabelFilter[];
  createdTo?: string | null;
  limit?: number;
  llmLabels?: OpsMatchingFitLabel[];
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
  const excludeRecommended = Boolean(args.excludeRecommended);
  const llmLabels = Array.from(new Set(args.llmLabels ?? []));
  const humanLabelFilterState = normalizeHumanLabelFilterState(
    args.humanLabels
  );
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
  const scanForClientFilters = Boolean(
    searchQuery ||
    excludeRecommended ||
    tags.length > 0 ||
    dateRange.startIso ||
    dateRange.endExclusiveIso
  );
  const [
    matchedTagTalentIds,
    taggedTalentIds,
    excludedTalentIds,
    searchMatchedTalentIds,
    roleFitRowsResult,
  ] = await Promise.all([
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
    searchQuery
      ? fetchSearchMatchedTalentIds({ admin, searchQuery })
      : Promise.resolve(null),
    loadRoleFitRows({
      admin,
      humanLabelMissing: humanLabelFilterState.includeMissing,
      humanLabels: humanLabelFilterState.labels,
      limit,
      llmLabels,
      offset,
      roleId,
      scanForClientFilters,
    }),
  ]);

  if (searchMatchedTalentIds && searchMatchedTalentIds.size === 0) {
    return {
      hasMore: false,
      items: [],
      limit,
      nextOffset: null,
      offset,
      totalCount: 0,
    };
  }

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

  const hasPositiveTagFilter = matchingTags.length > 0 || hasNoTagFilter;
  let filteredFitRows = scanForClientFilters
    ? roleFitRowsResult.rows.filter((row) => {
        const talentId = normalizeText(row.talent_id);
        if (!talentId) return false;
        if (searchMatchedTalentIds && !searchMatchedTalentIds.has(talentId)) {
          return false;
        }
        if (excludedTalentIds?.has(talentId)) return false;
        if (!hasPositiveTagFilter) return true;
        const matchesSelectedTag = Boolean(matchedTagTalentIds?.has(talentId));
        const matchesNoTag = Boolean(
          hasNoTagFilter && !taggedTalentIds?.has(talentId)
        );
        return matchesSelectedTag || matchesNoTag;
      })
    : roleFitRowsResult.rows;
  let filteredTalentRowMap: Map<string, TalentUserRow> | null = null;
  if (dateRange.startIso || dateRange.endExclusiveIso) {
    filteredTalentRowMap = await fetchTalentRowMap({
      admin,
      talentIds: filteredFitRows.map((row) => row.talent_id),
    });
    filteredFitRows = filteredFitRows.filter((row) => {
      const talentRow = filteredTalentRowMap?.get(row.talent_id);
      if (!talentRow) return false;
      if (!talentRow.created_at) return false;
      if (dateRange.startIso && talentRow.created_at < dateRange.startIso) {
        return false;
      }
      if (
        dateRange.endExclusiveIso &&
        talentRow.created_at >= dateRange.endExclusiveIso
      ) {
        return false;
      }
      return true;
    });
  }
  let recommendationMap: Map<string, OpsMatchingFitRecommendation> | null =
    null;
  if (excludeRecommended) {
    recommendationMap = await fetchFitRecommendationMap({
      admin,
      rows: filteredFitRows,
    });
    filteredFitRows = filteredFitRows.filter(
      (row) =>
        !recommendationMap?.has(
          getTalentRolePairKey({
            roleId: row.opportunity_id,
            talentId: row.talent_id,
          })
        )
    );
  }
  const totalCount = scanForClientFilters
    ? filteredFitRows.length
    : roleFitRowsResult.totalCount;
  const pagedFitRows = scanForClientFilters
    ? filteredFitRows.slice(offset, offset + limit)
    : filteredFitRows;
  if (!recommendationMap) {
    recommendationMap = await fetchFitRecommendationMap({
      admin,
      rows: pagedFitRows,
    });
  }
  const queuedManualRecommendationMap =
    await fetchQueuedManualRecommendationMap({
      admin,
      rows: pagedFitRows,
    });
  const talentRowMap =
    filteredTalentRowMap ??
    (await fetchTalentRowMap({
      admin,
      talentIds: pagedFitRows.map((row) => row.talent_id),
    }));
  const rows = pagedFitRows
    .map((row) => talentRowMap.get(row.talent_id))
    .filter((row): row is TalentUserRow => Boolean(row));
  const items = await buildOpsMatchingTalentItems({
    admin,
    fitMap: buildOpsMatchingTalentFitMap(
      pagedFitRows,
      recommendationMap,
      queuedManualRecommendationMap
    ),
    roleId,
    rows,
  });
  const nextOffset =
    offset + pagedFitRows.length < totalCount
      ? offset + pagedFitRows.length
      : null;

  return {
    hasMore: nextOffset !== null,
    items,
    limit,
    nextOffset,
    offset,
    totalCount,
  };
}

function emptyOpsMatchingFitResponse(args: {
  limit: number;
  offset: number;
}): OpsMatchingFitListResponse {
  return {
    hasMore: false,
    items: [],
    limit: args.limit,
    nextOffset: null,
    offset: args.offset,
    totalCount: 0,
  };
}

async function fetchMatchingFitSearchTargets(args: {
  admin: AdminClient;
  searchQuery: string;
}) {
  const searchPattern = buildMatchingIlikePattern(args.searchQuery);
  const [talentResult, roleResult, workspaceResult] = await Promise.all([
    args.admin
      .from("talent_users")
      .select("user_id")
      .or(`name.ilike.${searchPattern},email.ilike.${searchPattern}`)
      .limit(MAX_MATCHING_FIT_SEARCH_IDS),
    args.admin
      .from("company_roles")
      .select("role_id")
      .eq("source_type", "internal")
      .ilike("name", searchPattern)
      .limit(MAX_MATCHING_FIT_SEARCH_IDS),
    args.admin
      .from("company_workspace")
      .select("company_workspace_id")
      .ilike("company_name", searchPattern)
      .limit(MAX_MATCHING_FIT_SEARCH_IDS),
  ]);

  if (talentResult.error) {
    throw new Error(talentResult.error.message ?? "Failed to search talents");
  }
  if (roleResult.error) {
    throw new Error(roleResult.error.message ?? "Failed to search roles");
  }
  if (workspaceResult.error) {
    throw new Error(
      workspaceResult.error.message ?? "Failed to search companies"
    );
  }

  const talentIds = Array.from(
    new Set((talentResult.data ?? []).map((row) => normalizeText(row.user_id)))
  ).filter(Boolean);
  const roleIds = new Set(
    (roleResult.data ?? [])
      .map((row) => normalizeText(row.role_id))
      .filter(Boolean)
  );
  const workspaceIds = Array.from(
    new Set(
      (workspaceResult.data ?? [])
        .map((row) => normalizeText(row.company_workspace_id))
        .filter(Boolean)
    )
  );

  for (const chunk of chunkValues(workspaceIds)) {
    const { data, error } = await args.admin
      .from("company_roles")
      .select("role_id")
      .eq("source_type", "internal")
      .in("company_workspace_id", chunk)
      .limit(MAX_MATCHING_FIT_SEARCH_IDS);

    if (error) {
      throw new Error(error.message ?? "Failed to search company roles");
    }

    for (const row of data ?? []) {
      const roleId = normalizeText(row.role_id);
      if (roleId) roleIds.add(roleId);
    }
  }

  return {
    roleIds: Array.from(roleIds),
    talentIds,
  };
}

function buildFallbackOpsMatchingTalentItem(talentId: string) {
  return {
    createdAt: null,
    description: null,
    email: null,
    educations: [],
    experiences: [],
    extras: [],
    fit: null,
    hasSubmittedMaterial: false,
    headline: null,
    insights: [],
    isOnboardingDone: false,
    latestCompany: null,
    latestSchool: null,
    lastLoginedAt: null,
    memoPreview: null,
    name: null,
    profilePicture: null,
    recentCompanies: [],
    recentSchools: [],
    tags: [],
    talentTags: [],
    userId: talentId,
  } satisfies OpsMatchingTalentItem;
}

function getTalentRolePairKey(args: {
  roleId: string | null | undefined;
  talentId: string | null | undefined;
}) {
  return `${normalizeText(args.talentId)}:${normalizeText(args.roleId)}`;
}

async function fetchFitRecommendationMap(args: {
  admin: AdminClient;
  rows: TalentOpportunityFitRecordRow[];
}) {
  const pairKeys = new Set(
    args.rows.map((row) =>
      getTalentRolePairKey({
        roleId: row.opportunity_id,
        talentId: row.talent_id,
      })
    )
  );
  const talentIds = Array.from(
    new Set(args.rows.map((row) => normalizeText(row.talent_id)))
  ).filter(Boolean);
  const roleIds = Array.from(
    new Set(args.rows.map((row) => normalizeText(row.opportunity_id)))
  ).filter(Boolean);
  const recommendationMap = new Map<string, OpsMatchingFitRecommendation>();
  if (talentIds.length === 0 || roleIds.length === 0) {
    return recommendationMap;
  }

  const recommendationRows: TalentRecommendationForFitRow[] = [];
  for (const talentChunk of chunkValues(talentIds)) {
    for (const roleChunk of chunkValues(roleIds)) {
      const { data, error } = await args.admin
        .from("talent_opportunity_recommendation")
        .select(
          "id, talent_id, role_id, discovery_run_id, recommended_at, created_at"
        )
        .in("talent_id", talentChunk)
        .in("role_id", roleChunk)
        .order("recommended_at", {
          ascending: false,
          nullsFirst: false,
        })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(MAX_MATCHING_FIT_RECOMMENDATION_ROWS);

      if (error) {
        throw new Error(
          error.message ?? "Failed to load matching recommendations"
        );
      }

      recommendationRows.push(
        ...((data ?? []) as TalentRecommendationForFitRow[])
      );
    }
  }

  const manualRunIds = await fetchManualInternalRecommendationRunIds({
    admin: args.admin,
    runIds: recommendationRows.map((row) => row.discovery_run_id ?? ""),
  });

  for (const row of recommendationRows) {
    const pairKey = getTalentRolePairKey({
      roleId: row.role_id,
      talentId: row.talent_id,
    });
    if (!pairKeys.has(pairKey) || recommendationMap.has(pairKey)) {
      continue;
    }
    const discoveryRunId = row.discovery_run_id ?? null;
    recommendationMap.set(pairKey, {
      createdAt: row.created_at,
      isManualInternalRecommendation:
        discoveryRunId !== null && manualRunIds.has(discoveryRunId),
      recommendationId: row.id,
      recommendedAt: row.recommended_at ?? row.created_at,
    });
  }

  return recommendationMap;
}

async function fetchQueuedManualRecommendationMap(args: {
  admin: AdminClient;
  rows: TalentOpportunityFitRecordRow[];
}) {
  const pairKeys = new Set(
    args.rows.map((row) =>
      getTalentRolePairKey({
        roleId: row.opportunity_id,
        talentId: row.talent_id,
      })
    )
  );
  const talentIds = Array.from(
    new Set(args.rows.map((row) => normalizeText(row.talent_id)))
  ).filter(Boolean);
  const roleIds = Array.from(
    new Set(args.rows.map((row) => normalizeText(row.opportunity_id)))
  ).filter(Boolean);
  const queuedMap = new Map<string, string>();
  if (talentIds.length === 0 || roleIds.length === 0) return queuedMap;

  for (const talentChunk of chunkValues(talentIds)) {
    for (const roleChunk of chunkValues(roleIds)) {
      const { data, error } = await fromOpsMatchingTable(
        args.admin,
        "talent_progress"
      )
        .select("talent_id, role_id, created_at, recommendation_id, text")
        .in("talent_id", talentChunk)
        .in("role_id", roleChunk)
        .is("recommendation_id", null)
        .ilike("text", "%추천 생성/발송 대기 중입니다.%")
        .order("created_at", { ascending: false })
        .limit(MAX_MATCHING_PROGRESS_ITEMS);

      if (error) {
        if (isMissingOpsMatchingTableError(error)) {
          return queuedMap;
        }
        throw new Error(
          error.message ?? "Failed to load queued manual recommendations"
        );
      }

      for (const row of (data ?? []) as TalentProgressRow[]) {
        const pairKey = getTalentRolePairKey({
          roleId: row.role_id,
          talentId: row.talent_id,
        });
        if (!pairKeys.has(pairKey) || queuedMap.has(pairKey)) continue;
        queuedMap.set(pairKey, row.created_at);
      }
    }
  }

  return queuedMap;
}

async function fetchRoleTalentFitSummary(args: {
  admin: AdminClient;
  roleId: string;
  talentId: string;
}): Promise<OpsMatchingTalentFitSummary | null> {
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  if (!roleId || !talentId) return null;

  const { data, error } = await fromOpsMatchingTable(
    args.admin,
    "talent_opportunity_fit"
  )
    .select(
      "id, talent_id, opportunity_id, score, label, reason, reevaluation_criteria, human_label, human_reason, human_reviewed_by, human_reviewed_at, last_evaluated_at, reevaluation_checked_at, created_at"
    )
    .eq("opportunity_id", roleId)
    .eq("talent_id", talentId)
    .order("last_evaluated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    if (isMissingOpsMatchingTableError(error)) return null;
    throw new Error(error.message ?? "Failed to load role fit summary");
  }

  const row = ((data ?? []) as TalentOpportunityFitRecordRow[])[0];
  if (!row) return null;

  const [recommendationMap, queuedManualRecommendationMap] = await Promise.all([
    fetchFitRecommendationMap({ admin: args.admin, rows: [row] }),
    fetchQueuedManualRecommendationMap({ admin: args.admin, rows: [row] }),
  ]);

  return buildOpsMatchingTalentFitSummary(
    row,
    recommendationMap,
    queuedManualRecommendationMap
  );
}

async function buildOpsMatchingFitItems(args: {
  admin: AdminClient;
  rows: TalentOpportunityFitRecordRow[];
}) {
  const [
    talentRowMap,
    roleMap,
    recommendationMap,
    queuedManualRecommendationMap,
  ] = await Promise.all([
    fetchTalentRowMap({
      admin: args.admin,
      talentIds: args.rows.map((row) => row.talent_id),
    }),
    fetchRoleContextMap({
      admin: args.admin,
      roleIds: args.rows.map((row) => row.opportunity_id),
    }),
    fetchFitRecommendationMap({
      admin: args.admin,
      rows: args.rows,
    }),
    fetchQueuedManualRecommendationMap({
      admin: args.admin,
      rows: args.rows,
    }),
  ]);
  const talentRows = Array.from(talentRowMap.values());
  const talentItems = await buildOpsMatchingTalentItems({
    admin: args.admin,
    roleId: null,
    rows: talentRows,
  });
  const talentItemMap = new Map(
    talentItems.map((talent) => [talent.userId, talent])
  );

  return args.rows.map((row) => {
    const role = roleMap.get(row.opportunity_id);
    const label = normalizeText(row.label);
    const humanLabel = normalizeNullableText(row.human_label);
    return {
      createdAt: row.created_at,
      effectiveLabel: humanLabel || label,
      fitId: row.id,
      humanLabel,
      humanReason: normalizeNullableText(row.human_reason),
      humanReviewedAt: row.human_reviewed_at,
      humanReviewedBy: normalizeNullableText(row.human_reviewed_by),
      label,
      lastEvaluatedAt: row.last_evaluated_at,
      manualInternalRecommendationQueuedAt:
        queuedManualRecommendationMap.get(
          getTalentRolePairKey({
            roleId: row.opportunity_id,
            talentId: row.talent_id,
          })
        ) ?? null,
      reason: normalizeText(row.reason),
      recommendation:
        recommendationMap.get(
          getTalentRolePairKey({
            roleId: row.opportunity_id,
            talentId: row.talent_id,
          })
        ) ?? null,
      reevaluationCheckedAt: row.reevaluation_checked_at,
      reevaluationCriteria: row.reevaluation_criteria,
      role: {
        companyName: role?.companyName ?? null,
        companyWorkspaceId: role?.companyWorkspaceId ?? null,
        locationText: role?.locationText ?? null,
        roleId: row.opportunity_id,
        roleName: role?.roleName ?? null,
        status: role?.status ?? null,
        updatedAt: role?.updatedAt ?? null,
      },
      score: row.score,
      talent:
        talentItemMap.get(row.talent_id) ??
        buildFallbackOpsMatchingTalentItem(row.talent_id),
    } satisfies OpsMatchingFitItem;
  });
}

export async function fetchOpsMatchingFits(args: {
  humanLabels?: OpsMatchingHumanLabelFilter[];
  limit?: number;
  llmLabels?: OpsMatchingFitLabel[];
  offset?: number;
  query?: string | null;
}): Promise<OpsMatchingFitListResponse> {
  const limit = Math.max(
    1,
    Math.min(
      MAX_MATCHING_TALENT_LIMIT,
      args.limit ?? DEFAULT_MATCHING_TALENT_LIMIT
    )
  );
  const offset = Math.max(0, args.offset ?? 0);
  const searchQuery = normalizeText(args.query);
  const llmLabels = Array.from(new Set(args.llmLabels ?? []));
  const humanLabelFilterState = normalizeHumanLabelFilterState(
    args.humanLabels
  );
  const admin = getSupabaseAdmin();

  let fitQuery = fromOpsMatchingTable(admin, "talent_opportunity_fit").select(
    "id, talent_id, opportunity_id, score, label, reason, reevaluation_criteria, human_label, human_reason, human_reviewed_by, human_reviewed_at, last_evaluated_at, reevaluation_checked_at, created_at",
    { count: "exact" }
  );

  if (searchQuery) {
    const searchTargets = await fetchMatchingFitSearchTargets({
      admin,
      searchQuery,
    });
    if (
      searchTargets.talentIds.length === 0 &&
      searchTargets.roleIds.length === 0
    ) {
      return emptyOpsMatchingFitResponse({ limit, offset });
    }

    const filters: string[] = [];
    if (searchTargets.talentIds.length > 0) {
      filters.push(`talent_id.in.(${searchTargets.talentIds.join(",")})`);
    }
    if (searchTargets.roleIds.length > 0) {
      filters.push(`opportunity_id.in.(${searchTargets.roleIds.join(",")})`);
    }
    fitQuery = fitQuery.or(filters.join(","));
  }
  if (llmLabels.length > 0) {
    fitQuery = fitQuery.in("label", llmLabels);
  }
  if (
    humanLabelFilterState.includeMissing &&
    humanLabelFilterState.labels.length > 0
  ) {
    fitQuery = fitQuery.or(
      `human_label.is.null,human_label.in.(${humanLabelFilterState.labels.join(",")})`
    );
  } else if (humanLabelFilterState.includeMissing) {
    fitQuery = fitQuery.is("human_label", null);
  } else if (humanLabelFilterState.labels.length > 0) {
    fitQuery = fitQuery.in("human_label", humanLabelFilterState.labels);
  }

  const { data, error, count } = await fitQuery
    .order("last_evaluated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("talent_opportunity_fit");
    }
    throw new Error(error.message ?? "Failed to load internal fit records");
  }

  const rows = (data ?? []) as TalentOpportunityFitRecordRow[];
  const items = await buildOpsMatchingFitItems({ admin, rows });
  const totalCount = count ?? items.length;
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

export async function fetchOpsMatchingTalentFits(args: {
  talentId: string;
}): Promise<OpsMatchingTalentFitsResponse> {
  const talentId = normalizeText(args.talentId);
  if (!talentId) {
    return {
      items: [],
      talentId,
      totalCount: 0,
    };
  }

  const admin = getSupabaseAdmin();
  const rows: TalentOpportunityFitRecordRow[] = [];

  for (
    let offset = 0;
    offset < MAX_MATCHING_TALENT_DETAIL_FIT_ROWS;
    offset += MATCHING_TALENT_DETAIL_FIT_PAGE_SIZE
  ) {
    const { data, error } = await fromOpsMatchingTable(
      admin,
      "talent_opportunity_fit"
    )
      .select(
        "id, talent_id, opportunity_id, score, label, reason, reevaluation_criteria, human_label, human_reason, human_reviewed_by, human_reviewed_at, last_evaluated_at, reevaluation_checked_at, created_at"
      )
      .eq("talent_id", talentId)
      .order("last_evaluated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + MATCHING_TALENT_DETAIL_FIT_PAGE_SIZE - 1);

    if (error) {
      if (isMissingOpsMatchingTableError(error)) {
        throw createMissingOpsMatchingTableError("talent_opportunity_fit");
      }
      throw new Error(error.message ?? "Failed to load talent fit records");
    }

    const pageRows = (data ?? []) as TalentOpportunityFitRecordRow[];
    rows.push(...pageRows);
    if (pageRows.length < MATCHING_TALENT_DETAIL_FIT_PAGE_SIZE) break;
  }

  const items = await buildOpsMatchingFitItems({ admin, rows });

  return {
    items,
    talentId,
    totalCount: items.length,
  };
}

function normalizeOpsMatchingFitHumanLabel(
  value: unknown
): OpsMatchingFitLabel | null {
  if (value === null || value === undefined) return null;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (OPS_MATCHING_FIT_LABEL_SET.has(normalized)) {
    return normalized as OpsMatchingFitLabel;
  }
  throw new Error(
    `humanLabel must be one of ${OPS_MATCHING_FIT_LABELS.join(", ")} or null`
  );
}

export async function updateOpsMatchingFitHumanLabel(args: {
  fitId: string;
  humanLabel: unknown;
  humanReason?: unknown;
  reviewerEmail?: string | null;
}): Promise<OpsMatchingFitHumanLabelUpdateResponse> {
  const fitId = normalizeText(args.fitId);
  if (!fitId) throw new Error("fitId is required");

  const humanLabel = normalizeOpsMatchingFitHumanLabel(args.humanLabel);
  const now = new Date().toISOString();
  const reviewerEmail = normalizeNullableText(args.reviewerEmail);
  const humanReason = normalizeNullableText(String(args.humanReason ?? ""));
  const admin = getSupabaseAdmin();

  const { data, error } = await fromOpsMatchingTable(
    admin,
    "talent_opportunity_fit"
  )
    .update({
      human_label: humanLabel,
      human_reason: humanLabel ? humanReason : null,
      human_reviewed_at: humanLabel ? now : null,
      human_reviewed_by: humanLabel ? reviewerEmail : null,
    })
    .eq("id", fitId)
    .select(
      "id, label, human_label, human_reason, human_reviewed_by, human_reviewed_at"
    )
    .single();

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("talent_opportunity_fit");
    }
    throw new Error(error.message ?? "Failed to update human label");
  }

  const row = data as Pick<
    TalentOpportunityFitRecordRow,
    | "human_label"
    | "human_reason"
    | "human_reviewed_at"
    | "human_reviewed_by"
    | "id"
    | "label"
  >;
  const nextHumanLabel = normalizeOpsMatchingFitHumanLabel(row.human_label);
  const label = normalizeText(row.label);

  return {
    effectiveLabel: nextHumanLabel ?? label,
    fitId: row.id,
    humanLabel: nextHumanLabel,
    humanReason: normalizeNullableText(row.human_reason),
    humanReviewedAt: row.human_reviewed_at,
    humanReviewedBy: normalizeNullableText(row.human_reviewed_by),
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

function buildOpsMatchingRoleReviewStage(
  row: OpsMatchingRoleStageRow
): OpsMatchingRoleReviewStage {
  return {
    id: row.id,
    label: normalizeText(row.label),
    roleId: row.role_id,
    sortOrder: row.sort_order,
    stage: buildCustomReviewStageId(row.id),
  };
}

async function fetchOpsMatchingRoleReviewStagesWithAdmin(args: {
  admin: AdminClient;
  roleId: string;
}) {
  const roleId = normalizeText(args.roleId);
  if (!roleId) return [];

  const { data, error } = await fromOpsMatchingTable(
    args.admin,
    "ops_matching_role_stages"
  )
    .select("id, role_id, label, sort_order")
    .eq("role_id", roleId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    if (isMissingOpsMatchingTableError(error)) return [];
    throw new Error(error.message ?? "Failed to load matching role stages");
  }

  return ((data ?? []) as OpsMatchingRoleStageRow[]).map(
    buildOpsMatchingRoleReviewStage
  );
}

export async function fetchOpsMatchingRoleReviewStages(args: {
  roleId?: string | null;
}): Promise<OpsMatchingRoleReviewStage[]> {
  const roleId = normalizeText(args.roleId);
  if (!roleId) throw new Error("roleId is required");
  return fetchOpsMatchingRoleReviewStagesWithAdmin({
    admin: getSupabaseAdmin(),
    roleId,
  });
}

export async function createOpsMatchingRoleReviewStage(args: {
  label: unknown;
  roleId?: string | null;
}): Promise<OpsMatchingRoleReviewStageCreateResponse> {
  const roleId = normalizeText(args.roleId);
  const label = normalizeText(args.label).slice(
    0,
    MAX_MATCHING_ROLE_STAGE_LABEL_LENGTH
  );
  if (!roleId) throw new Error("roleId is required");
  if (!label) throw new Error("label is required");

  const admin = getSupabaseAdmin();
  const { data: latestRows, error: latestError } = await fromOpsMatchingTable(
    admin,
    "ops_matching_role_stages"
  )
    .select("sort_order")
    .eq("role_id", roleId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (latestError) {
    if (isMissingOpsMatchingTableError(latestError)) {
      throw createMissingOpsMatchingTableError("ops_matching_role_stages");
    }
    throw new Error(
      latestError.message ?? "Failed to load matching role stage"
    );
  }

  const latestSortOrder =
    ((latestRows ?? []) as Pick<OpsMatchingRoleStageRow, "sort_order">[])[0]
      ?.sort_order ?? 0;
  const { data, error } = await fromOpsMatchingTable(
    admin,
    "ops_matching_role_stages"
  )
    .insert({
      label,
      role_id: roleId,
      sort_order: latestSortOrder + 1,
    })
    .select("id, role_id, label, sort_order")
    .single();

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("ops_matching_role_stages");
    }
    if (error.code === "23505") {
      throw new Error("이미 같은 이름의 칼럼이 있습니다.");
    }
    throw new Error(error.message ?? "Failed to create matching role stage");
  }

  return {
    ok: true,
    roleId,
    stage: buildOpsMatchingRoleReviewStage(data as OpsMatchingRoleStageRow),
  };
}

export async function updateOpsMatchingRoleReviewStage(args: {
  label: unknown;
  roleId?: string | null;
  stageId?: string | null;
}): Promise<OpsMatchingRoleReviewStageUpdateResponse> {
  const roleId = normalizeText(args.roleId);
  const stageId = normalizeText(args.stageId);
  const label = normalizeText(args.label).slice(
    0,
    MAX_MATCHING_ROLE_STAGE_LABEL_LENGTH
  );
  if (!roleId) throw new Error("roleId is required");
  if (!stageId) throw new Error("stageId is required");
  if (!label) throw new Error("label is required");

  const { data, error } = await fromOpsMatchingTable(
    getSupabaseAdmin(),
    "ops_matching_role_stages"
  )
    .update({ label })
    .eq("id", stageId)
    .eq("role_id", roleId)
    .select("id, role_id, label, sort_order")
    .single();

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      throw createMissingOpsMatchingTableError("ops_matching_role_stages");
    }
    if (error.code === "23505") {
      throw new Error("이미 같은 이름의 칼럼이 있습니다.");
    }
    throw new Error(error.message ?? "Failed to update matching role stage");
  }

  return {
    ok: true,
    roleId,
    stage: buildOpsMatchingRoleReviewStage(data as OpsMatchingRoleStageRow),
  };
}

export async function deleteOpsMatchingRoleReviewStage(args: {
  roleId?: string | null;
  stageId?: string | null;
}): Promise<OpsMatchingRoleReviewStageDeleteResponse> {
  const roleId = normalizeText(args.roleId);
  const stageId = normalizeText(args.stageId);
  if (!roleId) throw new Error("roleId is required");
  if (!stageId) throw new Error("stageId is required");

  const admin = getSupabaseAdmin();
  const stageTag = buildCustomReviewStageTag(stageId);
  const { error: stageError } = await fromOpsMatchingTable(
    admin,
    "ops_matching_role_stages"
  )
    .delete()
    .eq("id", stageId)
    .eq("role_id", roleId);

  if (stageError) {
    if (isMissingOpsMatchingTableError(stageError)) {
      throw createMissingOpsMatchingTableError("ops_matching_role_stages");
    }
    throw new Error(stageError.message ?? "Failed to delete matching stage");
  }

  const { error: tagError } = await fromOpsMatchingTable(
    admin,
    "talent_opportunity_tag"
  )
    .delete()
    .eq("opportunity_id", roleId)
    .eq("tag", stageTag);

  if (tagError) {
    if (isMissingOpsMatchingTableError(tagError)) {
      throw createMissingOpsMatchingTableError("talent_opportunity_tag");
    }
    throw new Error(tagError.message ?? "Failed to delete matching stage tags");
  }

  return {
    ok: true,
    roleId,
    stageId,
  };
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
  const [
    matchedTagTalentIds,
    taggedTalentIds,
    excludedTalentIds,
    customStages,
  ] = await Promise.all([
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
    fetchOpsMatchingRoleReviewStagesWithAdmin({ admin, roleId }),
  ]);
  const customStageByTagKey = buildCustomReviewStageByTagKey(customStages);

  if (
    matchingTags.length > 0 &&
    matchedTagTalentIds &&
    matchedTagTalentIds.size === 0 &&
    !hasNoTagFilter
  ) {
    return {
      customStages,
      items: [],
      roleId,
      totalCount: 0,
    };
  }

  let query = admin
    .from("talent_opportunity_recommendation")
    .select(
      "id, talent_id, role_id, discovery_run_id, feedback, feedback_at, feedback_reason, processed_stage, saved_stage, viewed_at, recommended_at, created_at, updated_at"
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
        customStageByTagKey,
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
        viewedAt: row.viewed_at,
      };
    })
    .filter((item): item is OpsMatchingReviewItem => item !== null);

  return {
    customStages,
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
    opportunity_id: roleId,
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

export async function fetchOpsMatchingTagOptions(): Promise<OpsMatchingTagOptionsResponse> {
  const admin = getSupabaseAdmin();
  const { data, error } = await fromOpsMatchingTable(
    admin,
    "talent_opportunity_tag"
  )
    .select("tag, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_MATCHING_TAG_OPTION_ROWS);

  if (error) {
    if (isMissingOpsMatchingTableError(error)) {
      return { items: [] };
    }
    throw new Error(error.message ?? "Failed to load matching tag options");
  }

  const optionMap = new Map<string, OpsMatchingTagOption>();
  for (const row of (data ?? []) as Pick<
    TalentOpportunityTagRow,
    "tag" | "updated_at"
  >[]) {
    const tag = normalizeTag(row.tag);
    const tagKey = normalizeTagKey(tag);
    if (!tagKey || isInternalReviewStageTag(tag)) continue;
    const existing = optionMap.get(tagKey);
    if (existing) {
      existing.count += 1;
      if (
        row.updated_at &&
        (!existing.updatedAt || row.updated_at > existing.updatedAt)
      ) {
        existing.updatedAt = row.updated_at;
      }
      continue;
    }
    optionMap.set(tagKey, {
      count: 1,
      tag,
      updatedAt: row.updated_at ?? null,
    });
  }

  return {
    items: Array.from(optionMap.values()).sort((a, b) => {
      if (a.updatedAt && b.updatedAt) {
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      if (a.updatedAt) return -1;
      if (b.updatedAt) return 1;
      return a.tag.localeCompare(b.tag);
    }),
  };
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

  const admin = getSupabaseAdmin();
  const customStages = await fetchOpsMatchingRoleReviewStagesWithAdmin({
    admin,
    roleId,
  });
  const customStageByTagKey = buildCustomReviewStageByTagKey(customStages);
  const customStageLabelByStage = buildReviewStageLabelMap(customStages);
  const stageTag =
    MATCHING_REVIEW_STAGE_TAG_BY_STAGE[
      stage as keyof typeof MATCHING_REVIEW_STAGE_TAG_BY_STAGE
    ] ??
    (() => {
      const customStageId = getCustomReviewStageDbId(stage);
      const customStage = customStages.find(
        (item) => item.id === customStageId
      );
      return customStage ? buildCustomReviewStageTag(customStage.id) : "";
    })();
  if (!stageTag) throw new Error("Unsupported review stage");

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
    customStageByTagKey,
    feedback: recommendation?.feedback,
    tags: rows.map((row) => ({ id: row.id, tag: row.tag })),
  }).stage;
  const internalStageTagIds = rows
    .filter((row) => isInternalReviewStageTag(row.tag))
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
        customStageLabelByStage,
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

async function buildOpsMatchingRecommendationSummaries(args: {
  admin: AdminClient;
  rows: TalentRecommendationRow[];
  talentId: string;
}): Promise<OpsMatchingRecommendationSummary[]> {
  if (args.rows.length === 0) return [];
  const discoveryRunIds = args.rows
    .map((row) => row.discovery_run_id ?? "")
    .filter(Boolean);
  const [manualRunIds, deliveryMap, roleMap] = await Promise.all([
    fetchManualInternalRecommendationRunIds({
      admin: args.admin,
      runIds: discoveryRunIds,
    }),
    fetchRecommendationDeliveryMap({
      admin: args.admin,
      discoveryRunIds,
      talentId: args.talentId,
    }),
    fetchRoleNameMap({
      admin: args.admin,
      roleIds: args.rows.map((row) => row.role_id),
    }),
  ]);

  return args.rows.map((row) => {
    const discoveryRunId = row.discovery_run_id ?? null;
    const role = roleMap.get(row.role_id);
    return {
      companyName: role?.companyName ?? null,
      createdAt: row.created_at,
      deliveries: discoveryRunId ? (deliveryMap.get(discoveryRunId) ?? []) : [],
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
      roleName: role?.roleName ?? null,
      savedStage: row.saved_stage,
      sourceType: role?.sourceType ?? null,
      talentId: row.talent_id,
      updatedAt: row.updated_at,
      viewedAt: row.viewed_at,
      workspaceIsInternal: role?.workspaceIsInternal ?? null,
    };
  });
}

function isInternalRecommendationSummary(
  recommendation: OpsMatchingRecommendationSummary
) {
  return (
    recommendation.isManualInternalRecommendation ||
    normalizeText(recommendation.sourceType).toLowerCase() === "internal" ||
    recommendation.workspaceIsInternal === true
  );
}

async function fetchRecentRecommendations(args: {
  admin: AdminClient;
  limit: number;
  talentId: string;
}): Promise<OpsMatchingRecommendationSummary[]> {
  const { data, error } = await args.admin
    .from("talent_opportunity_recommendation")
    .select(
      "id, talent_id, role_id, discovery_run_id, processed_stage, feedback, feedback_at, feedback_reason, saved_stage, viewed_at, recommended_at, created_at, updated_at"
    )
    .eq("talent_id", args.talentId)
    .order("recommended_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(args.limit * 3);

  if (error) {
    throw new Error(error.message ?? "Failed to load recommendations");
  }

  const recommendations = await buildOpsMatchingRecommendationSummaries({
    admin: args.admin,
    rows: (data ?? []) as TalentRecommendationRow[],
    talentId: args.talentId,
  });

  return recommendations
    .filter(isInternalRecommendationSummary)
    .slice(0, args.limit);
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
      "id, talent_id, role_id, discovery_run_id, processed_stage, feedback, feedback_at, feedback_reason, saved_stage, viewed_at, recommended_at, created_at, updated_at"
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
  const summaries = await buildOpsMatchingRecommendationSummaries({
    admin: args.admin,
    rows: [row],
    talentId: args.talentId,
  });

  return summaries[0] ?? null;
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
    .select("role_id, name, company_workspace_id, source_type")
    .in("role_id", uniqueRoleIds);

  if (roleError) {
    throw new Error(roleError.message ?? "Failed to load progress roles");
  }

  const workspaceIds = Array.from(
    new Set((roleRows ?? []).map((row) => row.company_workspace_id))
  );
  const companyMap = new Map<
    string,
    { companyName: string | null; isInternal: boolean | null }
  >();
  if (workspaceIds.length > 0) {
    const { data: workspaceRows, error: workspaceError } = await args.admin
      .from("company_workspace")
      .select("company_workspace_id, company_name, is_internal")
      .in("company_workspace_id", workspaceIds);

    if (workspaceError) {
      throw new Error(workspaceError.message ?? "Failed to load companies");
    }

    for (const row of workspaceRows ?? []) {
      companyMap.set(row.company_workspace_id, {
        companyName: row.company_name,
        isInternal:
          typeof row.is_internal === "boolean" ? row.is_internal : null,
      });
    }
  }

  for (const row of roleRows ?? []) {
    const workspace = companyMap.get(row.company_workspace_id);
    roleMap.set(row.role_id, {
      companyName: workspace?.companyName ?? null,
      roleName: row.name,
      sourceType: row.source_type ?? null,
      workspaceIsInternal: workspace?.isInternal ?? null,
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
    source_type: string | null;
    status: string | null;
    updated_at: string | null;
  }> = [];
  for (const chunk of chunkValues(uniqueRoleIds)) {
    const { data, error } = await args.admin
      .from("company_roles")
      .select(
        "role_id, name, company_workspace_id, location_text, source_type, status, updated_at"
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
  const companyMap = new Map<
    string,
    { companyName: string | null; isInternal: boolean | null }
  >();
  for (const chunk of chunkValues(workspaceIds)) {
    const { data, error } = await args.admin
      .from("company_workspace")
      .select("company_workspace_id, company_name, is_internal")
      .in("company_workspace_id", chunk);

    if (error) {
      throw new Error(error.message ?? "Failed to load companies");
    }

    for (const row of data ?? []) {
      companyMap.set(row.company_workspace_id, {
        companyName: row.company_name,
        isInternal:
          typeof row.is_internal === "boolean" ? row.is_internal : null,
      });
    }
  }

  for (const row of roleRows) {
    const workspace = companyMap.get(row.company_workspace_id);
    roleMap.set(row.role_id, {
      companyName: workspace?.companyName ?? null,
      companyWorkspaceId: row.company_workspace_id,
      locationText: row.location_text,
      roleName: row.name,
      sourceType: row.source_type,
      status: row.status,
      updatedAt: row.updated_at,
      workspaceIsInternal: workspace?.isInternal ?? null,
    });
  }

  return roleMap;
}

async function fetchRecommendationDeliveryMap(args: {
  admin: AdminClient;
  discoveryRunIds: string[];
  talentId: string;
}) {
  const talentId = normalizeText(args.talentId);
  const discoveryRunIds = Array.from(
    new Set(args.discoveryRunIds.map(normalizeText))
  ).filter(Boolean);
  const deliveryMap = new Map<string, OpsMatchingRecommendationDelivery[]>();
  if (!talentId || discoveryRunIds.length === 0) return deliveryMap;

  const { data, error } = await args.admin
    .from("talent_opportunity_delivery")
    .select(
      "id, discovery_run_id, talent_id, channel, status, payload, sent_at, created_at"
    )
    .eq("talent_id", talentId)
    .in("discovery_run_id", discoveryRunIds)
    .order("created_at", { ascending: false })
    .limit(discoveryRunIds.length * MAX_MATCHING_RECOMMENDATION_DELIVERY_ITEMS);

  if (error) {
    throw new Error(error.message ?? "Failed to load recommendation delivery");
  }

  for (const row of (data ?? []) as TalentOpportunityDeliveryRow[]) {
    const rowDiscoveryRunId = normalizeText(row.discovery_run_id);
    if (!rowDiscoveryRunId) continue;
    const deliveries = deliveryMap.get(rowDiscoveryRunId) ?? [];
    if (deliveries.length >= MAX_MATCHING_RECOMMENDATION_DELIVERY_ITEMS) {
      continue;
    }
    const payload = parseJsonRecord(row.payload);
    deliveries.push({
      bodyText:
        getJsonString(payload, "textBody") ??
        getJsonString(payload, "bodyText") ??
        getJsonString(payload, "emailBody") ??
        getJsonString(payload, "body") ??
        getJsonString(payload, "message") ??
        getJsonString(payload, "chatMessage") ??
        getJsonString(payload, "text") ??
        getJsonString(payload, "content"),
      channel: row.channel,
      createdAt: row.created_at,
      id: row.id,
      sentAt: row.sent_at,
      status: row.status,
      subject:
        getJsonString(payload, "subject") ??
        getJsonString(payload, "emailSubject"),
      toEmail: getJsonString(payload, "toEmail"),
    });
    deliveryMap.set(rowDiscoveryRunId, deliveries);
  }

  return deliveryMap;
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
  const progressLimit = roleId
    ? MAX_MATCHING_PROGRESS_ITEMS
    : MAX_MATCHING_PROGRESS_ITEMS * 3;
  let query = fromOpsMatchingTable(admin, "talent_progress")
    .select(
      "id, talent_id, role_id, recommendation_id, text, user_id, created_at"
    )
    .eq("talent_id", talentId)
    .order("created_at", { ascending: false })
    .limit(progressLimit);

  if (roleId) {
    query = query.eq("role_id", roleId);
  }

  const [progressResult, recommendation, recommendations, fit] =
    await Promise.all([
      query,
      roleId
        ? fetchLatestRecommendation({ admin, roleId, talentId })
        : Promise.resolve(null),
      roleId
        ? Promise.resolve([])
        : fetchRecentRecommendations({
            admin,
            limit: MAX_MATCHING_PROGRESS_ITEMS,
            talentId,
          }),
      roleId
        ? fetchRoleTalentFitSummary({ admin, roleId, talentId })
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
  const timelineRecommendations = roleId
    ? recommendation
      ? [recommendation]
      : []
    : recommendations;
  const roleMap = await fetchRoleNameMap({
    admin,
    roleIds: [
      ...rows.map((row) => row.role_id),
      ...timelineRecommendations.map((item) => item.roleId),
      roleId,
    ],
  });
  const visibleRows = (
    roleId
      ? rows
      : rows.filter((row) => {
          const rowRoleId = normalizeText(row.role_id);
          return !rowRoleId || isInternalCompanyRole(roleMap.get(rowRoleId));
        })
  ).slice(0, MAX_MATCHING_PROGRESS_ITEMS);

  return {
    fit,
    items: visibleRows.map((row) => {
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
    recommendations: timelineRecommendations,
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
