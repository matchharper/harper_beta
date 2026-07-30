import type { Json } from "@/types/database.types";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  getPostingRoleIdFromOpportunityId,
  isPostingRoleId,
  normalizePostingRoleId,
  toPostingOpportunityId,
} from "@/lib/career/postingLinks";
import { OpportunityType, isOpportunityType } from "@/lib/opportunityType";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type RawCompanyDataRow = {
  confidence: number | null;
  last_funding_round_description: string | null;
  last_funding_stage: string | null;
  main_investors: string | null;
  searched_at: string | null;
  total_funding_raised: string | null;
};

type RawRecommendationRow = {
  clicked_at: string | null;
  created_at: string;
  feedback: string | null;
  feedback_at: string | null;
  feedback_reason: string | null;
  fit_summary: string | null;
  id: string;
  opportunity_type: string | null;
  preference_fit: Json | null;
  fit_reasons: Json;
  role_id: string;
  saved_stage: string | null;
  talent_memo: string | null;
  tradeoffs: Json;
  viewed_at: string | null;
  company_role: {
    company_workspace: {
      company_description: string | null;
      company_db_id: number | null;
      company_db: {
        id: number | null;
        logo: string | null;
      } | null;
      company_name: string;
      homepage_url: string | null;
      linkedin_url: string | null;
      logo_url: string | null;
      company_data?: RawCompanyDataRow | RawCompanyDataRow[] | null;
    } | null;
    description: string | null;
    external_jd_url: string | null;
    expires_at: string | null;
    location_text: string | null;
    name: string;
    is_expired: boolean | null;
    posted_at: string | null;
    role_id: string;
    summary: Json | null;
    source_job_id: string | null;
    source_provider: string | null;
    source_type: string;
    status: string;
    type: string[];
    work_mode: string | null;
  } | null;
};

type RawRecentRecommendationPromptRow = {
  feedback: string | null;
  feedback_reason: string | null;
  role_id: string | null;
  saved_stage: string | null;
  company_role: {
    location_text: string | null;
    name: string;
    source_type: string;
    type: string[] | null;
    work_mode: string | null;
    company_workspace: {
      company_name: string;
      company_db: {
        employee_count_range: Json | null;
      } | null;
    } | null;
  } | null;
};

type RawPostingRecommendationRow = {
  clicked_at: string | null;
  created_at: string | null;
  feedback: string | null;
  feedback_at: string | null;
  feedback_reason: string | null;
  fit_summary: string | null;
  id: string;
  opportunity_type: string | null;
  preference_fit: Json | null;
  fit_reasons: Json;
  saved_stage: string | null;
  talent_memo: string | null;
  tradeoffs: Json;
  viewed_at: string | null;
};

type RawPostingRoleRow = {
  description: string | null;
  external_jd_url: string | null;
  expires_at: string | null;
  location_text: string | null;
  name: string;
  is_expired: boolean | null;
  posted_at: string | null;
  role_id: string;
  summary: Json | null;
  source_job_id: string | null;
  source_provider: string | null;
  source_type: string;
  status: string;
  talent_opportunity_recommendation: RawPostingRecommendationRow[] | null;
  type: string[] | null;
  work_mode: string | null;
  company_workspace: {
    company_description: string | null;
    company_db_id: number | null;
    company_db: {
      id: number | null;
      logo: string | null;
    } | null;
    company_name: string;
    homepage_url: string | null;
    linkedin_url: string | null;
    logo_url: string | null;
    company_data?: RawCompanyDataRow | RawCompanyDataRow[] | null;
  } | null;
};

type RawTalentOpportunityTagRow = {
  opportunity_id: string | null;
  tag: string;
  updated_at: string | null;
};

type RawTalentProgressRow = {
  created_at: string;
  metadata: Json;
  role_id: string;
  text: string;
};

const TALENT_OPPORTUNITY_HISTORY_SELECT = `
  id,
  role_id,
  opportunity_type,
  preference_fit,
  fit_summary,
  created_at,
  fit_reasons,
  tradeoffs,
  feedback,
  feedback_at,
  feedback_reason,
  saved_stage,
  talent_memo,
  viewed_at,
  clicked_at,
  company_role:company_roles!inner (
    role_id,
    name,
    description,
    external_jd_url,
    expires_at,
    location_text,
    is_expired,
    posted_at,
    summary,
    type,
    work_mode,
    status,
    source_type,
    source_provider,
    source_job_id,
    company_workspace:company_workspace!inner (
      company_name,
      company_description,
      company_db_id,
      homepage_url,
      linkedin_url,
      logo_url,
      company_db:company_db (
        id,
        logo
      ),
      company_data:company_data!company_data_company_workspace_id_fkey (
        total_funding_raised,
        main_investors,
        last_funding_stage,
        last_funding_round_description,
        confidence,
        searched_at
      )
    )
  )
`;

const TALENT_RECENT_RECOMMENDATION_PROMPT_SELECT = `
  feedback,
  feedback_reason,
  role_id,
  saved_stage,
  company_role:company_roles!inner (
    name,
    location_text,
    type,
    work_mode,
    source_type,
    company_workspace:company_workspace!inner (
      company_name,
      company_db:company_db (
        employee_count_range
      )
    )
  )
`;

const TALENT_POSTING_ROLE_SELECT = `
  role_id,
  name,
  description,
  external_jd_url,
  expires_at,
  location_text,
  is_expired,
  posted_at,
  summary,
  type,
  work_mode,
  status,
  source_type,
  source_provider,
  source_job_id,
  company_workspace:company_workspace!inner (
    company_name,
    company_description,
    company_db_id,
    homepage_url,
    linkedin_url,
    logo_url,
    company_db:company_db (
      id,
      logo
    ),
    company_data:company_data!company_data_company_workspace_id_fkey (
      total_funding_raised,
      main_investors,
      last_funding_stage,
      last_funding_round_description,
      confidence,
      searched_at
    )
  ),
  talent_opportunity_recommendation:talent_opportunity_recommendation!role_id (
    id,
    opportunity_type,
    preference_fit,
    fit_summary,
    created_at,
    fit_reasons,
    tradeoffs,
    feedback,
    feedback_at,
    feedback_reason,
    saved_stage,
    talent_memo,
    viewed_at,
    clicked_at,
    talent_id
  )
`;

export type TalentOpportunityFeedback = "positive" | "negative";

export { OpportunityType as TalentOpportunityType };

export type TalentOpportunitySavedStage =
  | "saved"
  | "applied"
  | "connected"
  | "closed"
  | "hidden";

export type TalentOpportunitySavedStageFilter =
  | TalentOpportunitySavedStage
  | "all";

export type TalentOpportunityHistoryTab = "new" | "saved" | "archived";

export type TalentOpportunitySavedStageHistoryPages = {
  counts: TalentOpportunityHistoryCounts;
  pages: Partial<
    Record<TalentOpportunitySavedStage, TalentOpportunityHistoryPage>
  >;
};

export type TalentInternalRecommendationProgressCode =
  | "awaiting_company_response"
  | "closed_by_company"
  | "company_acknowledged_awaiting_response"
  | "company_next_process"
  | "no_company_response_closed"
  | "stopped_by_candidate"
  | "waiting_to_share";

export type TalentInternalRecommendationProgressStage =
  | "accepted"
  | "archived"
  | "connected"
  | "custom"
  | "final_offer"
  | "hold"
  | "pending_connection"
  | "process_stopped"
  | "rejected";

export type TalentInternalRecommendationStopReason =
  | "candidate"
  | "company"
  | "internal";

export type TalentInternalRecommendationProgressEvent = {
  createdAt: string;
  metadata: Json;
  text: string;
};

export type TalentInternalRecommendationProgress = {
  acceptedAt: string;
  code: TalentInternalRecommendationProgressCode;
  daysSinceAccepted: number | null;
  daysSinceStageChanged: number | null;
  message: string;
  stage: TalentInternalRecommendationProgressStage | null;
  stageChangedAt: string | null;
  stageTag: string | null;
  stopReason: TalentInternalRecommendationStopReason | null;
};

export type TalentOpportunityCompanyData = {
  confidence: number | null;
  lastFundingRoundDescription: string | null;
  lastFundingStage: string | null;
  mainInvestors: string | null;
  searchedAt: string | null;
  totalFundingRaised: string | null;
};

export type TalentOpportunityHistoryItem = {
  clickedAt: string | null;
  companyData: TalentOpportunityCompanyData | null;
  companyDescription: string | null;
  companyDbId: number | null;
  companyHomepageUrl: string | null;
  companyLinkedinUrl: string | null;
  companyLogoUrl: string | null;
  companyName: string;
  description: string | null;
  employmentTypes: string[];
  externalJdUrl: string | null;
  expiresAt: string | null;
  feedback: TalentOpportunityFeedback | null;
  feedbackAt: string | null;
  feedbackReason: string | null;
  href: string | null;
  id: string;
  isExpired: boolean;
  isAccepted: boolean;
  isInternal: boolean;
  internalProgress: TalentInternalRecommendationProgress | null;
  kind: "match" | "recommendation";
  location: string | null;
  opportunityType: OpportunityType;
  postedAt: string | null;
  preferenceFit: TalentOpportunityPreferenceFitItem[];
  recommendedAt: string;
  recommendationConcerns: string[];
  recommendationReasons: string[];
  recommendationSummary: string | null;
  roleId: string;
  savedStage: TalentOpportunitySavedStage | null;
  sourceJobId: string | null;
  sourceProvider: string | null;
  sourceType: "internal" | "external";
  status: string;
  talentMemo: string | null;
  title: string;
  viewedAt: string | null;
  workMode: string | null;
};

export type TalentRecentRecommendationPromptItem = {
  companyName: string;
  companySize: string | null;
  employmentTypes: string[];
  feedback: TalentOpportunityFeedback | null;
  feedbackReason: string | null;
  location: string | null;
  roleId: string | null;
  savedStage: TalentOpportunitySavedStage | null;
  sourceType: "internal" | "external";
  title: string;
  workMode: string | null;
};

export type TalentOpportunityPreferenceFitStatus =
  | "Satisfied"
  | "Neutral"
  | "Dissatisfied";

export type TalentOpportunityPreferenceFitKey =
  | "next_scope"
  | "location"
  | "compensation"
  | "deal_breakers"
  | "must_haves";

export type TalentOpportunityPreferenceFitItem = {
  key: TalentOpportunityPreferenceFitKey;
  label: string;
  note: string;
  status: TalentOpportunityPreferenceFitStatus;
};

export type TalentOpportunityHistoryPage = {
  counts: TalentOpportunityHistoryCounts;
  items: TalentOpportunityHistoryItem[];
  limit: number;
  nextOffset: number | null;
  offset: number;
};

export type TalentOpportunityHistoryCounts = {
  archived: number;
  new: number;
  newInternal: number;
  saved: number;
  savedStages: Record<TalentOpportunitySavedStage, number>;
  total: number;
};

type TalentOpportunitySourceType = "internal" | "external";

type RawSavedStageFallbackRow = {
  opportunity_type: string | null;
  company_role: {
    source_type: string;
  } | null;
};

function coerceJsonArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getRecommendationKindForOpportunityType(
  opportunityType: OpportunityType
): "match" | "recommendation" {
  return opportunityType === OpportunityType.IntroRequest
    ? "match"
    : "recommendation";
}

function normalizeOpportunityType(args: {
  sourceType: "internal" | "external";
  value: unknown;
}): OpportunityType {
  if (isOpportunityType(args.value)) return args.value;
  if (args.sourceType === "internal") {
    return OpportunityType.InternalRecommendation;
  }
  return OpportunityType.ExternalJd;
}

function normalizeSavedStage(
  value: unknown
): TalentOpportunitySavedStage | null {
  if (
    value === "saved" ||
    value === "applied" ||
    value === "connected" ||
    value === "closed" ||
    value === "hidden"
  ) {
    return value;
  }
  return null;
}

function normalizeSourceType(value: unknown): "internal" | "external" {
  return value === "external" ? "external" : "internal";
}

function normalizeFeedback(value: unknown): TalentOpportunityFeedback | null {
  if (value === "like") return "positive";
  if (value === "dislike") return "negative";
  return null;
}

const INTERNAL_RECOMMENDATION_PROGRESS_STAGE_BY_TAG = {
  "내부:수락": "accepted",
  "내부:아카이브": "archived",
  "내부:연결됨": "connected",
  "내부:최종오퍼": "final_offer",
  "내부:보류": "hold",
  "내부:연결대기": "pending_connection",
  "내부:프로세스중단": "process_stopped",
  "내부:거절": "rejected",
} as const satisfies Record<string, TalentInternalRecommendationProgressStage>;

const CUSTOM_INTERNAL_RECOMMENDATION_PROGRESS_TAG_PREFIX = "내부단계:";
const INTERNAL_RECOMMENDATION_PROGRESS_DAY_MS = 24 * 60 * 60 * 1000;
const INTERNAL_RECOMMENDATION_PROGRESS_ONE_WEEK_DAYS = 7;
const INTERNAL_RECOMMENDATION_PROGRESS_THREE_WEEKS_DAYS = 21;
const INTERNAL_RECOMMENDATION_TERMINAL_STAGE_GRACE_DAYS = 3;
const INTERNAL_PROGRESS_EVENT_MATCH_WINDOW_MS = 5 * 60 * 1000;

const INTERNAL_RECOMMENDATION_PROGRESS_MESSAGES: Record<
  TalentInternalRecommendationProgressCode,
  string
> = {
  awaiting_company_response: "회사에게 전달되었고, 회신을 기다리고 있습니다.",
  closed_by_company:
    "회사 측에서 이번 포지션에서는 더 이상 진행하지 않기로 했습니다. 이력과 경험에 기반해 긍정적으로 검토했으나, 우선적으로 보고 있는 방향과 더 가까운 후보자와 다음 단계를 진행하게 되었다고 알려왔습니다. 또 다른 좋은 기회가 있을 때 연락드릴게요. 감사합니다.",
  company_acknowledged_awaiting_response:
    "회사에게 전달되었고, 회신을 기다리고 있습니다. 회사에서 후보자님을 인지한 상태이니 조금만 기다려주세요.",
  company_next_process:
    "회사에서 다음 프로세스를 진행하겠다고 알렸습니다. 혹시 아직 다른 연락이 없으신가요?",
  no_company_response_closed:
    "회사에게서 응답이 없습니다. 더 이상 프로세스를 진행할 의사가 없는 것으로 판단됩니다. 프로세스를 종료하고 더이상 트래킹 하지 않겠습니다. 불편을 드려 죄송합니다.",
  stopped_by_candidate: "요청하신 대로 이 포지션의 진행을 종료했습니다.",
  waiting_to_share: "적절한 타이밍에 회사에게 전달하기 위해 대기중입니다.",
};

const INTERNAL_ENDED_ROLE_PROGRESS_MESSAGE_AFTER_ACCEPTANCE =
  "회사에서 해당 역할의 채용을 종료했다고 알려왔습니다. 이에 따라 이 기회의 프로세스를 종료하겠습니다.";
const INTERNAL_ENDED_ROLE_PROGRESS_MESSAGE_AT_ACCEPTANCE =
  "회사에 전달했지만 추가 진행 없이 해당 역할의 채용이 종료되었습니다. 자세한 검토까지 이어지지 않았을 가능성이 높습니다. 이에 따라 이 기회의 프로세스를 종료하겠습니다.";

function normalizeInternalProgressTagKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isCustomInternalProgressTag(value: unknown) {
  return normalizeInternalProgressTagKey(value).startsWith(
    normalizeInternalProgressTagKey(
      CUSTOM_INTERNAL_RECOMMENDATION_PROGRESS_TAG_PREFIX
    )
  );
}

function resolveInternalProgressStageFromTags(
  tags: RawTalentOpportunityTagRow[]
): {
  stage: TalentInternalRecommendationProgressStage | null;
  stageChangedAt: string | null;
  stageTag: string | null;
} {
  for (const row of tags) {
    const tagKey = normalizeInternalProgressTagKey(row.tag);
    const stage =
      INTERNAL_RECOMMENDATION_PROGRESS_STAGE_BY_TAG[
        row.tag.trim() as keyof typeof INTERNAL_RECOMMENDATION_PROGRESS_STAGE_BY_TAG
      ] ??
      INTERNAL_RECOMMENDATION_PROGRESS_STAGE_BY_TAG[
        tagKey as keyof typeof INTERNAL_RECOMMENDATION_PROGRESS_STAGE_BY_TAG
      ];
    if (stage) {
      return {
        stage,
        stageChangedAt: row.updated_at ?? null,
        stageTag: row.tag,
      };
    }
    if (isCustomInternalProgressTag(row.tag)) {
      return {
        stage: "custom",
        stageChangedAt: row.updated_at ?? null,
        stageTag: row.tag,
      };
    }
  }
  return { stage: null, stageChangedAt: null, stageTag: null };
}

function getDaysSinceInternalProgressDate(value: string | null | undefined) {
  if (!value) return null;
  const valueMs = Date.parse(value);
  if (!Number.isFinite(valueMs)) return null;
  return Math.max(
    0,
    Math.floor((Date.now() - valueMs) / INTERNAL_RECOMMENDATION_PROGRESS_DAY_MS)
  );
}

function getJsonRecord(value: Json | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Json | undefined>;
}

function normalizeInternalStopReason(value: unknown) {
  return value === "candidate" || value === "company" || value === "internal"
    ? value
    : null;
}

function isProcessStoppedProgressEvent(
  event: TalentInternalRecommendationProgressEvent
) {
  const metadata = getJsonRecord(event.metadata);
  const stage = String(metadata?.stage ?? "")
    .trim()
    .toLowerCase();
  const tag = String(metadata?.tag ?? "").trim();
  const text = String(event.text ?? "");
  return (
    stage === "process_stopped" ||
    tag === "내부:프로세스중단" ||
    text.includes("프로세스 중단") ||
    text.includes("진행을 중단")
  );
}

function resolveInternalStopReason(args: {
  events: TalentInternalRecommendationProgressEvent[];
  stageChangedAt: string | null;
}): TalentInternalRecommendationStopReason {
  const stageChangedAtMs = Date.parse(args.stageChangedAt ?? "");

  for (const event of args.events) {
    if (!isProcessStoppedProgressEvent(event)) continue;

    const eventCreatedAtMs = Date.parse(event.createdAt);
    if (
      Number.isFinite(stageChangedAtMs) &&
      Number.isFinite(eventCreatedAtMs) &&
      Math.abs(eventCreatedAtMs - stageChangedAtMs) >
        INTERNAL_PROGRESS_EVENT_MATCH_WINDOW_MS
    ) {
      continue;
    }

    const metadata = getJsonRecord(event.metadata);
    return normalizeInternalStopReason(metadata?.stopReason) ?? "internal";
  }

  // Legacy Ops changes only stored the shared process_stopped tag. Candidate
  // self-stop did not exist before stopReason events were introduced, so an
  // un-attributed legacy stop must retain the existing internal/company
  // closure semantics instead of being presented as a candidate request.
  return "internal";
}

export function buildInternalRecommendationProgress(args: {
  events?: TalentInternalRecommendationProgressEvent[];
  item: TalentOpportunityHistoryItem;
  tags: RawTalentOpportunityTagRow[];
}): TalentInternalRecommendationProgress | null {
  if (!args.item.isInternal || args.item.feedback !== "positive") return null;

  const acceptedAt = args.item.feedbackAt ?? args.item.recommendedAt;
  const daysSinceAccepted = getDaysSinceInternalProgressDate(acceptedAt);
  const { stage, stageChangedAt, stageTag } =
    resolveInternalProgressStageFromTags(args.tags);
  const stopReason =
    stage === "process_stopped"
      ? resolveInternalStopReason({
          events: args.events ?? [],
          stageChangedAt,
        })
      : null;
  const daysSinceStageChanged =
    getDaysSinceInternalProgressDate(stageChangedAt);
  const effectiveStage = stage ?? "accepted";
  const isEndedRole = args.item.status.trim().toLowerCase() === "ended";
  let code: TalentInternalRecommendationProgressCode;
  const isWithinInitialAcceptanceGrace =
    daysSinceAccepted !== null &&
    daysSinceAccepted < INTERNAL_RECOMMENDATION_PROGRESS_ONE_WEEK_DAYS;
  const isWithinTerminalStageGrace =
    daysSinceStageChanged !== null &&
    daysSinceStageChanged < INTERNAL_RECOMMENDATION_TERMINAL_STAGE_GRACE_DAYS;

  if (effectiveStage === "process_stopped" && stopReason === "candidate") {
    code = "stopped_by_candidate";
  } else if (isEndedRole) {
    code = "closed_by_company";
  } else if (effectiveStage === "pending_connection") {
    code = "company_acknowledged_awaiting_response";
  } else if (effectiveStage === "process_stopped") {
    code = "closed_by_company";
  } else if (effectiveStage === "archived" || effectiveStage === "rejected") {
    code =
      isWithinInitialAcceptanceGrace || isWithinTerminalStageGrace
        ? "awaiting_company_response"
        : "closed_by_company";
  } else if (effectiveStage !== "accepted") {
    code = "company_next_process";
  } else if (
    daysSinceAccepted !== null &&
    daysSinceAccepted >= INTERNAL_RECOMMENDATION_PROGRESS_THREE_WEEKS_DAYS
  ) {
    code = "no_company_response_closed";
  } else if (
    daysSinceAccepted !== null &&
    daysSinceAccepted >= INTERNAL_RECOMMENDATION_PROGRESS_ONE_WEEK_DAYS
  ) {
    code = "awaiting_company_response";
  } else {
    code = "waiting_to_share";
  }

  return {
    acceptedAt,
    code,
    daysSinceAccepted,
    daysSinceStageChanged,
    message:
      isEndedRole && code === "closed_by_company"
        ? effectiveStage === "accepted"
          ? INTERNAL_ENDED_ROLE_PROGRESS_MESSAGE_AT_ACCEPTANCE
          : INTERNAL_ENDED_ROLE_PROGRESS_MESSAGE_AFTER_ACCEPTANCE
        : INTERNAL_RECOMMENDATION_PROGRESS_MESSAGES[code],
    stage,
    stageChangedAt,
    stageTag,
    stopReason,
  };
}

export function toDatabaseFeedback(
  value: TalentOpportunityFeedback | null | undefined
): "like" | "dislike" | null {
  if (value === "positive") return "like";
  if (value === "negative") return "dislike";
  return null;
}

function normalizeOpportunityPromptText(value: unknown, fallback: string) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || fallback;
}

function normalizePromptTextOrNull(value: unknown) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || null;
}

function normalizePromptTextList(value: unknown, limit = 4) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizePromptTextOrNull(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
}

function compactEmployeeCountRangeForPrompt(value: Json | null | undefined) {
  if (!value) return null;

  if (typeof value === "string") {
    return normalizePromptTextOrNull(value);
  }

  if (Array.isArray(value)) {
    return normalizePromptTextOrNull(value.slice(0, 2).join("-"));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const start = record.start ?? record.min ?? record.from ?? record.lower;
    const end = record.end ?? record.max ?? record.to ?? record.upper;
    if (start && end) return `${start}-${end} employees`;
    if (start) return `${start}+ employees`;
    if (end) return `up to ${end} employees`;
  }

  return null;
}

function mapRecentRecommendationPromptRow(
  row: RawRecentRecommendationPromptRow
): TalentRecentRecommendationPromptItem | null {
  const role = row.company_role;
  const workspace = role?.company_workspace;
  if (!role || !workspace) return null;

  return {
    companyName: normalizeOpportunityPromptText(
      workspace.company_name,
      "Unknown company"
    ),
    companySize: compactEmployeeCountRangeForPrompt(
      workspace.company_db?.employee_count_range ?? null
    ),
    employmentTypes: normalizePromptTextList(role.type, 4),
    feedback: normalizeFeedback(row.feedback),
    feedbackReason: normalizePromptTextOrNull(row.feedback_reason),
    location: normalizePromptTextOrNull(role.location_text),
    roleId: normalizePromptTextOrNull(row.role_id),
    savedStage: normalizeSavedStage(row.saved_stage),
    sourceType: normalizeSourceType(role.source_type),
    title: normalizeOpportunityPromptText(role.name, "Unknown role"),
    workMode: normalizePromptTextOrNull(role.work_mode),
  };
}

export function formatRecentRecommendedOpportunitiesForPrompt(
  items: readonly TalentRecentRecommendationPromptItem[] | null | undefined,
  maxItems = 10
) {
  const limit =
    typeof maxItems === "number" && Number.isFinite(maxItems)
      ? Math.max(0, Math.min(Math.floor(maxItems), 10))
      : 10;

  return (items ?? [])
    .slice(0, limit)
    .map((item) => {
      const sourceType =
        item.sourceType === "external" ? "external" : "internal";
      const feedback = item.feedback ?? "none";
      const roleIdPrefix = item.roleId ? `roleId: ${item.roleId}, ` : "";
      const savedStage = item.savedStage ?? "none";
      const details =
        item.feedback === null
          ? []
          : [
              item.location ? `location: ${item.location}` : "",
              item.workMode ? `work mode: ${item.workMode}` : "",
              item.employmentTypes.length > 0
                ? `types: ${item.employmentTypes.join("/")}`
                : "",
              item.companySize ? `company size: ${item.companySize}` : "",
              item.feedbackReason
                ? `feedback reason: ${item.feedbackReason}`
                : "",
            ].filter(Boolean);

      return [
        `(${sourceType}) ${item.title} at ${item.companyName} - ${roleIdPrefix}User feedback: ${feedback}, saved stage: ${savedStage}`,
        ...details,
      ]
        .filter(Boolean)
        .join(", \n");
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function normalizeTextList(value: Json, limit = 8): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  if (value && typeof value === "object") {
    return Object.values(value)
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  return [];
}

const PREFERENCE_FIT_LABELS: Record<TalentOpportunityPreferenceFitKey, string> =
  {
    next_scope: "다음 역할",
    location: "근무 지역",
    compensation: "보상",
    deal_breakers: "회피 조건",
    must_haves: "필수 조건",
  };

const PREFERENCE_FIT_KEYS = Object.keys(
  PREFERENCE_FIT_LABELS
) as TalentOpportunityPreferenceFitKey[];

function normalizePreferenceFitStatus(
  value: unknown
): TalentOpportunityPreferenceFitStatus | null {
  if (
    value === "Satisfied" ||
    value === "Neutral" ||
    value === "Dissatisfied"
  ) {
    return value;
  }
  return null;
}

function normalizePreferenceFit(
  value: Json | null
): TalentOpportunityPreferenceFitItem[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;

  return PREFERENCE_FIT_KEYS.map((key) => {
    const rawItem = record[key];
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      return null;
    }
    const item = rawItem as Record<string, unknown>;
    const status = normalizePreferenceFitStatus(item.status);
    const note = String(item.note ?? "").trim();
    if (!status || !note) return null;
    return {
      key,
      label: PREFERENCE_FIT_LABELS[key],
      note,
      status,
    } satisfies TalentOpportunityPreferenceFitItem;
  }).filter(
    (item): item is TalentOpportunityPreferenceFitItem => item !== null
  );
}

const createEmptyHistoryCounts = (): TalentOpportunityHistoryCounts => ({
  archived: 0,
  new: 0,
  newInternal: 0,
  saved: 0,
  savedStages: {
    saved: 0,
    applied: 0,
    connected: 0,
    closed: 0,
    hidden: 0,
  },
  total: 0,
});

const getDefaultSavedStageForOpportunity = (args: {
  opportunityType: OpportunityType;
  sourceType: TalentOpportunitySourceType;
}): TalentOpportunitySavedStage =>
  args.sourceType === "internal" ||
  args.opportunityType === OpportunityType.InternalRecommendation ||
  args.opportunityType === OpportunityType.IntroRequest
    ? "connected"
    : "saved";

const INACTIVE_ROLE_STATUSES = new Set([
  "archived",
  "closed",
  "ended",
  "expired",
  "inactive",
]);

function isExpiredOpportunityRole(args: {
  expiresAt?: string | null;
  isExpired?: boolean | null;
  status?: string | null;
}) {
  if (args.isExpired === true) return true;

  const normalizedStatus = String(args.status ?? "")
    .trim()
    .toLowerCase();
  if (INACTIVE_ROLE_STATUSES.has(normalizedStatus)) return true;

  if (!args.expiresAt) return false;
  const expiresAtMs = Date.parse(args.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs < Date.now();
}

function buildTalentOpportunityHistoryQuery(args: {
  admin: AdminClient;
  feedback?: "like" | "dislike" | null;
  historyTab?: TalentOpportunityHistoryTab;
  sourceType?: TalentOpportunitySourceType;
  userId: string;
}) {
  let query = (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(TALENT_OPPORTUNITY_HISTORY_SELECT)
    .eq("talent_id", args.userId)
    .order("created_at", { ascending: false }) as any;

  if (args.sourceType) {
    query = query.eq("company_role.source_type", args.sourceType);
  }

  if (args.historyTab === "new") {
    query = query
      .is("feedback", null)
      .or("saved_stage.is.null,saved_stage.neq.hidden");
  } else if (args.historyTab === "saved") {
    query = query.or(
      "feedback.eq.like,and(feedback.is.null,saved_stage.eq.hidden)"
    );
  } else if (args.historyTab === "archived") {
    query = query.eq("feedback", "dislike");
  } else if ("feedback" in args) {
    query =
      args.feedback === null
        ? query.is("feedback", null)
        : query.eq("feedback", args.feedback);
  }

  return query;
}

export async function archiveEndedInternalOpportunitiesForTalent(args: {
  admin: AdminClient;
  locale?: string | null;
  userId: string;
}) {
  const { data, error } = await (args.admin as any).rpc(
    "archive_ended_internal_opportunities_for_talent",
    {
      p_locale: args.locale ?? null,
      p_talent_id: args.userId,
    }
  );

  if (error) {
    throw new Error(
      error.message ?? "Failed to archive ended internal opportunities"
    );
  }

  const archivedCount = Number(data ?? 0);
  return Number.isFinite(archivedCount) ? Math.max(0, archivedCount) : 0;
}

export async function fetchRecentRecommendedOpportunitiesForPrompt(args: {
  admin: AdminClient;
  limit?: number;
  userId: string;
}) {
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(Math.floor(args.limit), 10))
      : 10;

  const { data, error } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(TALENT_RECENT_RECOMMENDATION_PROMPT_SELECT)
    .eq("talent_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(limit) as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to load recent recommended opportunities"
    );
  }

  return coerceJsonArray<RawRecentRecommendationPromptRow>(data)
    .map(mapRecentRecommendationPromptRow)
    .filter(
      (item): item is TalentRecentRecommendationPromptItem => item !== null
    );
}

async function countTalentOpportunityRecommendations(args: {
  admin: AdminClient;
  historyTab: TalentOpportunityHistoryTab;
  savedStage?: TalentOpportunitySavedStage;
  sourceType?: TalentOpportunitySourceType;
  userId: string;
}) {
  let query = (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      args.sourceType
        ? "id, company_role:company_roles!inner(source_type)"
        : "id",
      { count: "exact", head: true }
    )
    .eq("talent_id", args.userId) as any;

  if (args.historyTab === "new") {
    query = query
      .is("feedback", null)
      .or("saved_stage.is.null,saved_stage.neq.hidden");
  } else if (args.historyTab === "saved") {
    query = query.or(
      "feedback.eq.like,and(feedback.is.null,saved_stage.eq.hidden)"
    );
  } else {
    query = query.eq("feedback", "dislike");
  }

  if (args.savedStage) {
    query = query.eq("saved_stage", args.savedStage);
  }

  if (args.sourceType) {
    query = query.eq("company_role.source_type", args.sourceType);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message ?? "Failed to count talent opportunities");
  }

  return Math.max(0, count ?? 0);
}

async function fetchSavedRowsMissingStage(args: {
  admin: AdminClient;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      `
        opportunity_type,
        company_role:company_roles!inner (
          source_type,
          company_workspace:company_workspace!inner (
            company_name
          )
        )
      `
    )
    .eq("talent_id", args.userId)
    .eq("feedback", "like")
    .is("saved_stage", null) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to count saved opportunities");
  }

  return coerceJsonArray<RawSavedStageFallbackRow>(data);
}

export async function fetchTalentOpportunityHistoryCounts(args: {
  admin: AdminClient;
  userId: string;
}): Promise<TalentOpportunityHistoryCounts> {
  const [
    newCount,
    newInternalCount,
    savedCount,
    archivedCount,
    savedStageCount,
    appliedStageCount,
    connectedStageCount,
    closedStageCount,
    hiddenStageCount,
    savedRowsMissingStage,
  ] = await Promise.all([
    countTalentOpportunityRecommendations({
      admin: args.admin,
      historyTab: "new",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      historyTab: "new",
      sourceType: "internal",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      historyTab: "saved",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      historyTab: "archived",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      historyTab: "saved",
      savedStage: "saved",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      historyTab: "saved",
      savedStage: "applied",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      historyTab: "saved",
      savedStage: "connected",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      historyTab: "saved",
      savedStage: "closed",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      historyTab: "saved",
      savedStage: "hidden",
      userId: args.userId,
    }),
    fetchSavedRowsMissingStage({
      admin: args.admin,
      userId: args.userId,
    }),
  ]);

  const counts = createEmptyHistoryCounts();
  counts.new = newCount;
  counts.newInternal = newInternalCount;
  counts.saved = savedCount;
  counts.archived = archivedCount;
  counts.total = newCount + savedCount + archivedCount;
  counts.savedStages.saved = savedStageCount;
  counts.savedStages.applied = appliedStageCount;
  counts.savedStages.connected = connectedStageCount;
  counts.savedStages.closed = closedStageCount;
  counts.savedStages.hidden = hiddenStageCount;

  for (const row of savedRowsMissingStage) {
    const sourceType = normalizeSourceType(row.company_role?.source_type);
    const opportunityType = normalizeOpportunityType({
      sourceType,
      value: row.opportunity_type,
    });
    const defaultStage = getDefaultSavedStageForOpportunity({
      opportunityType,
      sourceType,
    });
    counts.savedStages[defaultStage] += 1;
  }

  return counts;
}

async function fetchTalentOpportunityHistoryCountsFallback(args: {
  admin: AdminClient;
  userId: string;
}) {
  try {
    return await fetchTalentOpportunityHistoryCounts(args);
  } catch (error) {
    console.warn("[TalentOpportunity] failed to load history counts", {
      error: error instanceof Error ? error.message : "Unknown error",
      userId: args.userId,
    });
    return createEmptyHistoryCounts();
  }
}

function normalizeCompanyDataString(value: unknown) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function normalizeCompanyDataNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLocalizedRoleSummaryContent(
  value: unknown,
  locale?: string | null
) {
  const normalizedLocale = String(locale ?? "")
    .trim()
    .toLowerCase();
  if (!normalizedLocale) return null;

  const languageKey = normalizedLocale.startsWith("ko") ? "ko" : "en";
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entry = (value as Record<string, unknown>)[languageKey];
  const rawContent =
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>).content
      : entry;
  const content = String(rawContent ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return content || null;
}

function mapCompanyDataRow(
  value: RawCompanyDataRow | RawCompanyDataRow[] | null | undefined
): TalentOpportunityCompanyData | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return null;

  const companyData: TalentOpportunityCompanyData = {
    confidence: normalizeCompanyDataNumber(row.confidence),
    lastFundingRoundDescription: normalizeCompanyDataString(
      row.last_funding_round_description
    ),
    lastFundingStage: normalizeCompanyDataString(row.last_funding_stage),
    mainInvestors: normalizeCompanyDataString(row.main_investors),
    searchedAt: normalizeCompanyDataString(row.searched_at),
    totalFundingRaised: normalizeCompanyDataString(row.total_funding_raised),
  };

  return Object.values(companyData).some((item) => item !== null)
    ? companyData
    : null;
}

function mapRecommendationRow(
  row: RawRecommendationRow,
  locale?: string | null
): TalentOpportunityHistoryItem | null {
  const role = row.company_role;
  const workspace = role?.company_workspace;
  if (!role || !workspace) return null;

  const sourceType = normalizeSourceType(role.source_type);
  const externalJdUrl = role.external_jd_url ?? null;
  const homepageUrl = workspace.homepage_url ?? null;
  const linkedinUrl = workspace.linkedin_url ?? null;
  const href = externalJdUrl || homepageUrl || linkedinUrl || null;
  const opportunityType = normalizeOpportunityType({
    sourceType,
    value: row.opportunity_type,
  });
  const kind = getRecommendationKindForOpportunityType(opportunityType);
  const companyData = mapCompanyDataRow(workspace.company_data);

  return {
    clickedAt: row.clicked_at ?? null,
    companyData,
    companyDescription: workspace.company_description ?? null,
    companyDbId:
      typeof workspace.company_db_id === "number"
        ? workspace.company_db_id
        : typeof workspace.company_db?.id === "number"
          ? workspace.company_db.id
          : null,
    companyHomepageUrl: homepageUrl,
    companyLinkedinUrl: linkedinUrl,
    companyLogoUrl: workspace.company_db?.logo ?? workspace.logo_url ?? null,
    companyName: String(workspace.company_name ?? ""),
    description: role.description ?? null,
    employmentTypes: Array.isArray(role.type) ? role.type : [],
    externalJdUrl,
    expiresAt: role.expires_at ?? null,
    feedback: normalizeFeedback(row.feedback),
    feedbackAt: row.feedback_at ?? null,
    feedbackReason: row.feedback_reason ?? null,
    href,
    id: String(row.id ?? ""),
    isExpired: isExpiredOpportunityRole({
      expiresAt: role.expires_at,
      isExpired: role.is_expired,
      status: role.status,
    }),
    isAccepted: kind === "match",
    isInternal: sourceType === "internal",
    internalProgress: null,
    kind,
    location: role.location_text ?? null,
    opportunityType,
    postedAt: role.posted_at ?? null,
    preferenceFit: normalizePreferenceFit(row.preference_fit ?? null),
    recommendedAt: row.created_at,
    recommendationConcerns: normalizeTextList(row.tradeoffs, 3),
    recommendationReasons: normalizeTextList(row.fit_reasons),
    recommendationSummary:
      getLocalizedRoleSummaryContent(role.summary, locale) ??
      row.fit_summary ??
      null,
    roleId: String(row.role_id ?? ""),
    savedStage: normalizeSavedStage(row.saved_stage),
    sourceJobId: role.source_job_id ?? null,
    sourceProvider: role.source_provider ?? null,
    sourceType,
    status: String(role.status ?? "active"),
    talentMemo: row.talent_memo ?? null,
    title: String(role.name ?? ""),
    viewedAt: row.viewed_at ?? null,
    workMode: role.work_mode ?? null,
  };
}

function pickLatestPostingRecommendation(
  recommendations: RawPostingRecommendationRow[] | null | undefined
) {
  const rows = Array.isArray(recommendations) ? recommendations : [];
  if (rows.length === 0) return null;

  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(left.created_at ?? "");
    const rightTime = Date.parse(right.created_at ?? "");
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    return safeRight - safeLeft;
  })[0];
}

function mapPostingRoleRow(
  row: RawPostingRoleRow,
  fallbackRecommendedAt: string,
  locale?: string | null
): TalentOpportunityHistoryItem | null {
  const workspace = row.company_workspace;
  if (!workspace) return null;

  const sourceType = normalizeSourceType(row.source_type);
  const existingRecommendation = pickLatestPostingRecommendation(
    row.talent_opportunity_recommendation
  );
  const opportunityType = normalizeOpportunityType({
    sourceType,
    value: existingRecommendation?.opportunity_type,
  });
  const kind = getRecommendationKindForOpportunityType(opportunityType);
  const externalJdUrl = row.external_jd_url ?? null;
  const homepageUrl = workspace.homepage_url ?? null;
  const linkedinUrl = workspace.linkedin_url ?? null;
  const href = externalJdUrl || homepageUrl || linkedinUrl || null;
  const roleId = String(row.role_id ?? "");
  const companyData = mapCompanyDataRow(workspace.company_data);

  return {
    clickedAt: existingRecommendation?.clicked_at ?? null,
    companyData,
    companyDescription: workspace.company_description ?? null,
    companyDbId:
      typeof workspace.company_db_id === "number"
        ? workspace.company_db_id
        : typeof workspace.company_db?.id === "number"
          ? workspace.company_db.id
          : null,
    companyHomepageUrl: homepageUrl,
    companyLinkedinUrl: linkedinUrl,
    companyLogoUrl: workspace.company_db?.logo ?? workspace.logo_url ?? null,
    companyName: String(workspace.company_name ?? ""),
    description: row.description ?? null,
    employmentTypes: Array.isArray(row.type) ? row.type : [],
    externalJdUrl,
    expiresAt: row.expires_at ?? null,
    feedback: normalizeFeedback(existingRecommendation?.feedback),
    feedbackAt: existingRecommendation?.feedback_at ?? null,
    feedbackReason: existingRecommendation?.feedback_reason ?? null,
    href,
    id: existingRecommendation?.id
      ? String(existingRecommendation.id)
      : toPostingOpportunityId(roleId),
    isExpired: isExpiredOpportunityRole({
      expiresAt: row.expires_at,
      isExpired: row.is_expired,
      status: row.status,
    }),
    isAccepted: kind === "match",
    isInternal: sourceType === "internal",
    internalProgress: null,
    kind,
    location: row.location_text ?? null,
    opportunityType,
    postedAt: row.posted_at ?? null,
    preferenceFit: normalizePreferenceFit(
      existingRecommendation?.preference_fit ?? null
    ),
    recommendedAt:
      existingRecommendation?.created_at ??
      row.posted_at ??
      fallbackRecommendedAt,
    recommendationConcerns: normalizeTextList(
      existingRecommendation?.tradeoffs ?? [],
      3
    ),
    recommendationReasons: normalizeTextList(
      existingRecommendation?.fit_reasons ?? []
    ),
    recommendationSummary:
      getLocalizedRoleSummaryContent(row.summary, locale) ??
      existingRecommendation?.fit_summary ??
      null,
    roleId,
    savedStage: normalizeSavedStage(existingRecommendation?.saved_stage),
    sourceJobId: row.source_job_id ?? null,
    sourceProvider: row.source_provider ?? null,
    sourceType,
    status: String(row.status ?? "active"),
    talentMemo: existingRecommendation?.talent_memo ?? null,
    title: String(row.name ?? ""),
    viewedAt: existingRecommendation?.viewed_at ?? null,
    workMode: row.work_mode ?? null,
  };
}

async function fetchInternalProgressTagsForHistoryItems(args: {
  admin: AdminClient;
  items: TalentOpportunityHistoryItem[];
  userId: string;
}) {
  const roleIds = Array.from(
    new Set(
      args.items
        .filter((item) => item.isInternal && item.feedback === "positive")
        .map((item) => item.roleId)
        .filter(Boolean)
    )
  );
  if (roleIds.length === 0) {
    return new Map<string, RawTalentOpportunityTagRow[]>();
  }

  const { data, error } = await ((
    args.admin.from("talent_opportunity_tag" as any) as any
  )
    .select("opportunity_id, tag, updated_at")
    .eq("talent_id", args.userId)
    .in("opportunity_id", roleIds)
    .order("updated_at", { ascending: false }) as any);

  if (error) {
    console.warn("[TalentOpportunity] failed to load internal progress tags", {
      error: error.message ?? "Unknown error",
      userId: args.userId,
    });
    return new Map<string, RawTalentOpportunityTagRow[]>();
  }

  const tagsByRoleId = new Map<string, RawTalentOpportunityTagRow[]>();
  for (const row of coerceJsonArray<RawTalentOpportunityTagRow>(data)) {
    const roleId = String(row.opportunity_id ?? "").trim();
    const tag = String(row.tag ?? "").trim();
    if (!roleId || !tag) continue;
    const rows = tagsByRoleId.get(roleId) ?? [];
    rows.push({ ...row, tag });
    tagsByRoleId.set(roleId, rows);
  }
  return tagsByRoleId;
}

async function fetchInternalProgressEventsForHistoryItems(args: {
  admin: AdminClient;
  items: TalentOpportunityHistoryItem[];
  userId: string;
}) {
  const roleIds = Array.from(
    new Set(
      args.items
        .filter((item) => item.isInternal && item.feedback === "positive")
        .map((item) => item.roleId)
        .filter(Boolean)
    )
  );
  if (roleIds.length === 0) {
    return new Map<string, TalentInternalRecommendationProgressEvent[]>();
  }

  const { data, error } = await ((
    args.admin.from("talent_progress" as any) as any
  )
    .select("role_id, metadata, text, created_at")
    .eq("talent_id", args.userId)
    .in("role_id", roleIds)
    .order("created_at", { ascending: false }) as any);

  if (error) {
    console.warn(
      "[TalentOpportunity] failed to load internal progress events",
      {
        error: error.message ?? "Unknown error",
        userId: args.userId,
      }
    );
    return new Map<string, TalentInternalRecommendationProgressEvent[]>();
  }

  const eventsByRoleId = new Map<
    string,
    TalentInternalRecommendationProgressEvent[]
  >();
  for (const row of coerceJsonArray<RawTalentProgressRow>(data)) {
    const roleId = String(row.role_id ?? "").trim();
    if (!roleId) continue;
    const events = eventsByRoleId.get(roleId) ?? [];
    events.push({
      createdAt: row.created_at,
      metadata: row.metadata,
      text: row.text,
    });
    eventsByRoleId.set(roleId, events);
  }
  return eventsByRoleId;
}

async function enrichTalentOpportunityHistoryItems(args: {
  admin: AdminClient;
  items: TalentOpportunityHistoryItem[];
  userId: string;
}) {
  if (args.items.length === 0) return args.items;

  const [tagsByRoleId, eventsByRoleId] = await Promise.all([
    fetchInternalProgressTagsForHistoryItems(args),
    fetchInternalProgressEventsForHistoryItems(args),
  ]);
  if (tagsByRoleId.size === 0) {
    return args.items.map((item) => ({
      ...item,
      internalProgress: buildInternalRecommendationProgress({
        events: eventsByRoleId.get(item.roleId) ?? [],
        item,
        tags: [],
      }),
    }));
  }

  return args.items.map((item) => ({
    ...item,
    internalProgress: buildInternalRecommendationProgress({
      events: eventsByRoleId.get(item.roleId) ?? [],
      item,
      tags: tagsByRoleId.get(item.roleId) ?? [],
    }),
  }));
}

export async function fetchTalentOpportunityHistory(args: {
  admin: AdminClient;
  feedback?: "like" | "dislike" | null;
  historyTab?: TalentOpportunityHistoryTab;
  limit?: number;
  locale?: string | null;
  offset?: number;
  sourceType?: TalentOpportunitySourceType;
  userId: string;
}) {
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(Math.floor(args.limit), 100))
      : null;
  const offset =
    typeof args.offset === "number" && Number.isFinite(args.offset)
      ? Math.max(0, Math.floor(args.offset))
      : 0;

  let query = buildTalentOpportunityHistoryQuery({
    admin: args.admin,
    ...(Object.prototype.hasOwnProperty.call(args, "feedback")
      ? { feedback: args.feedback }
      : {}),
    historyTab: args.historyTab,
    sourceType: args.sourceType,
    userId: args.userId,
  });

  if (limit !== null) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message ?? "Failed to load talent opportunities");
  }

  const items = coerceJsonArray<RawRecommendationRow>(data)
    .map((row) => mapRecommendationRow(row, args.locale))
    .filter((item): item is TalentOpportunityHistoryItem => item !== null);
  return enrichTalentOpportunityHistoryItems({
    admin: args.admin,
    items,
    userId: args.userId,
  });
}

function getResolvedTalentOpportunitySavedStage(
  item: TalentOpportunityHistoryItem
) {
  return (
    item.savedStage ??
    getDefaultSavedStageForOpportunity({
      opportunityType: item.opportunityType,
      sourceType: item.sourceType,
    })
  );
}

function filterHistoryItemsForSavedStage(
  items: TalentOpportunityHistoryItem[],
  savedStage?: TalentOpportunitySavedStageFilter
) {
  if (!savedStage) return items;

  return items.filter((item) => {
    const resolvedStage = getResolvedTalentOpportunitySavedStage(item);
    if (savedStage === "all") return resolvedStage !== "hidden";
    return resolvedStage === savedStage;
  });
}

async function fetchFilteredTalentOpportunityHistoryPage(args: {
  admin: AdminClient;
  historyTab: TalentOpportunityHistoryTab;
  limit: number;
  locale?: string | null;
  offset: number;
  savedStage?: TalentOpportunitySavedStageFilter;
  userId: string;
}): Promise<TalentOpportunityHistoryPage> {
  const [allItems, counts] = await Promise.all([
    fetchTalentOpportunityHistory({
      admin: args.admin,
      historyTab: args.historyTab,
      locale: args.locale,
      userId: args.userId,
    }),
    fetchTalentOpportunityHistoryCountsFallback({
      admin: args.admin,
      userId: args.userId,
    }),
  ]);
  const filteredItems =
    args.historyTab === "saved"
      ? filterHistoryItemsForSavedStage(allItems, args.savedStage)
      : allItems;
  const items = filteredItems.slice(args.offset, args.offset + args.limit);

  return {
    counts,
    items,
    limit: args.limit,
    nextOffset:
      args.offset + items.length < filteredItems.length
        ? args.offset + items.length
        : null,
    offset: args.offset,
  };
}

export async function fetchTalentOpportunitySavedStageHistoryPages(args: {
  admin: AdminClient;
  limit?: number;
  locale?: string | null;
  offset?: number;
  savedStages: TalentOpportunitySavedStage[];
  userId: string;
}): Promise<TalentOpportunitySavedStageHistoryPages> {
  await archiveEndedInternalOpportunitiesForTalent({
    admin: args.admin,
    locale: args.locale,
    userId: args.userId,
  });

  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(Math.floor(args.limit), 100))
      : 10;
  const offset =
    typeof args.offset === "number" && Number.isFinite(args.offset)
      ? Math.max(0, Math.floor(args.offset))
      : 0;
  const savedStages = Array.from(new Set(args.savedStages));

  const [allItems, counts] = await Promise.all([
    fetchTalentOpportunityHistory({
      admin: args.admin,
      historyTab: "saved",
      locale: args.locale,
      userId: args.userId,
    }),
    fetchTalentOpportunityHistoryCountsFallback({
      admin: args.admin,
      userId: args.userId,
    }),
  ]);

  const pages: TalentOpportunitySavedStageHistoryPages["pages"] = {};
  for (const savedStage of savedStages) {
    const filteredItems = filterHistoryItemsForSavedStage(allItems, savedStage);
    const items = filteredItems.slice(offset, offset + limit);
    pages[savedStage] = {
      counts,
      items,
      limit,
      nextOffset:
        offset + items.length < filteredItems.length
          ? offset + items.length
          : null,
      offset,
    };
  }

  return {
    counts,
    pages,
  };
}

export async function fetchTalentOpportunityHistoryPage(args: {
  admin: AdminClient;
  historyTab?: TalentOpportunityHistoryTab;
  limit?: number;
  locale?: string | null;
  offset?: number;
  savedStage?: TalentOpportunitySavedStageFilter;
  userId: string;
}): Promise<TalentOpportunityHistoryPage> {
  await archiveEndedInternalOpportunitiesForTalent({
    admin: args.admin,
    locale: args.locale,
    userId: args.userId,
  });

  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(0, Math.min(Math.floor(args.limit), 100))
      : 10;
  const offset =
    typeof args.offset === "number" && Number.isFinite(args.offset)
      ? Math.max(0, Math.floor(args.offset))
      : 0;

  if (limit === 0) {
    const counts = await fetchTalentOpportunityHistoryCountsFallback({
      admin: args.admin,
      userId: args.userId,
    });

    return {
      counts,
      items: [],
      limit,
      nextOffset: null,
      offset,
    };
  }

  if (args.historyTab) {
    return fetchFilteredTalentOpportunityHistoryPage({
      admin: args.admin,
      historyTab: args.historyTab,
      limit,
      locale: args.locale,
      offset,
      savedStage: args.savedStage,
      userId: args.userId,
    });
  }

  const [externalItems, internalItems, counts] = await Promise.all([
    fetchTalentOpportunityHistory({
      admin: args.admin,
      limit,
      locale: args.locale,
      offset,
      sourceType: "external",
      userId: args.userId,
    }),
    offset === 0
      ? fetchTalentOpportunityHistory({
          admin: args.admin,
          limit: Math.max(limit, 20),
          locale: args.locale,
          sourceType: "internal",
          userId: args.userId,
        })
      : Promise.resolve([]),
    fetchTalentOpportunityHistoryCountsFallback({
      admin: args.admin,
      userId: args.userId,
    }),
  ]);
  const seen = new Set<string>();
  const items = [...internalItems, ...externalItems].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return {
    counts,
    items,
    limit,
    nextOffset:
      externalItems.length === limit ? offset + externalItems.length : null,
    offset,
  };
}

export async function fetchTalentOpportunityHistoryByIds(args: {
  admin: AdminClient;
  ids: string[];
  locale?: string | null;
  userId: string;
}) {
  const ids = Array.from(
    new Set(args.ids.map((id) => String(id ?? "").trim()).filter(Boolean))
  );
  if (ids.length === 0) return [];

  const { data, error } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(TALENT_OPPORTUNITY_HISTORY_SELECT)
    .eq("talent_id", args.userId)
    .in("id", ids) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent opportunities");
  }

  const items = coerceJsonArray<RawRecommendationRow>(data)
    .map((row) => mapRecommendationRow(row, args.locale))
    .filter((item): item is TalentOpportunityHistoryItem => item !== null);
  return enrichTalentOpportunityHistoryItems({
    admin: args.admin,
    items,
    userId: args.userId,
  });
}

export async function fetchTalentOpportunityHistoryByRoleIds(args: {
  admin: AdminClient;
  locale?: string | null;
  roleIds: string[];
  userId: string;
}) {
  const roleIds = Array.from(
    new Set(args.roleIds.map((id) => String(id ?? "").trim()).filter(Boolean))
  );
  if (roleIds.length === 0) return [];

  const { data, error } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(TALENT_OPPORTUNITY_HISTORY_SELECT)
    .eq("talent_id", args.userId)
    .in("role_id", roleIds)
    .order("created_at", { ascending: false }) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent opportunities");
  }

  const items = await enrichTalentOpportunityHistoryItems({
    admin: args.admin,
    items: coerceJsonArray<RawRecommendationRow>(data)
      .map((row) => mapRecommendationRow(row, args.locale))
      .filter((item): item is TalentOpportunityHistoryItem => item !== null),
    userId: args.userId,
  });
  const byRoleId = new Map<string, TalentOpportunityHistoryItem>();

  for (const item of items) {
    if (!byRoleId.has(item.roleId)) {
      byRoleId.set(item.roleId, item);
    }
  }

  return roleIds
    .map((roleId) => byRoleId.get(roleId))
    .filter((item): item is TalentOpportunityHistoryItem => item !== undefined);
}

export async function fetchTalentPostingCardsByRoleIds(args: {
  admin: AdminClient;
  locale?: string | null;
  roleIds: string[];
  userId: string;
}) {
  const roleIds = Array.from(
    new Set(
      args.roleIds
        .map((id) => normalizePostingRoleId(id))
        .filter((id) => id && isPostingRoleId(id))
    )
  );
  if (roleIds.length === 0) return [];

  const { data, error } = await ((
    args.admin.from("company_roles" as any) as any
  )
    .select(TALENT_POSTING_ROLE_SELECT)
    .in("role_id", roleIds)
    .eq("talent_opportunity_recommendation.talent_id", args.userId) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load posting cards");
  }

  const fallbackRecommendedAt = new Date().toISOString();
  const byRoleId = new Map(
    coerceJsonArray<RawPostingRoleRow>(data)
      .map((row) => mapPostingRoleRow(row, fallbackRecommendedAt, args.locale))
      .filter((item): item is TalentOpportunityHistoryItem => item !== null)
      .map((item) => [item.roleId, item])
  );

  return roleIds
    .map((roleId) => byRoleId.get(roleId))
    .filter((item): item is TalentOpportunityHistoryItem => item !== undefined);
}

async function ensureTalentOpportunityRecommendationForPostingRole(args: {
  admin: AdminClient;
  roleId: string;
  userId: string;
}) {
  const roleId = String(args.roleId ?? "").trim();
  if (!roleId) {
    throw new Error("roleId is required");
  }

  const { data: existing, error: existingError } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select("id")
    .eq("talent_id", args.userId)
    .eq("role_id", roleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as any);

  if (existingError) {
    throw new Error(
      existingError.message ?? "Failed to load existing recommendation"
    );
  }

  const existingId = String(existing?.id ?? "").trim();
  if (existingId) return existingId;

  const { data: role, error: roleError } = await ((
    args.admin.from("company_roles" as any) as any
  )
    .select("role_id, source_type")
    .eq("role_id", roleId)
    .maybeSingle() as any);

  if (roleError) {
    throw new Error(roleError.message ?? "Failed to load posting role");
  }
  if (!role) {
    throw new Error("Posting role not found");
  }

  const sourceType = normalizeSourceType(role.source_type);
  const opportunityType =
    sourceType === "internal"
      ? OpportunityType.InternalRecommendation
      : OpportunityType.ExternalJd;
  const { data: inserted, error: insertError } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .insert({
      evidence: [],
      fit_reasons: [],
      opportunity_type: opportunityType,
      preference_fit: {},
      role_id: roleId,
      talent_id: args.userId,
      tradeoffs: [],
    })
    .select("id")
    .single() as any);

  if (insertError) {
    throw new Error(
      insertError.message ?? "Failed to create posting recommendation"
    );
  }

  const insertedId = String(inserted?.id ?? "").trim();
  if (!insertedId) {
    throw new Error("Created posting recommendation is missing id");
  }
  return insertedId;
}

async function resolvePositiveFeedbackSavedStage(args: {
  admin: AdminClient;
  opportunityId: string;
  requestedSavedStage?: TalentOpportunitySavedStage | null;
  userId: string;
}) {
  if (args.requestedSavedStage !== undefined) {
    return args.requestedSavedStage;
  }

  const { data, error } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select("company_role:company_roles!inner(source_type)")
    .eq("talent_id", args.userId)
    .eq("id", args.opportunityId)
    .maybeSingle() as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to resolve opportunity source type"
    );
  }

  const relation = Array.isArray(data?.company_role)
    ? data.company_role[0]
    : data?.company_role;
  return relation?.source_type === "internal" ? "connected" : null;
}

export async function updateTalentOpportunityHistoryItem(args: {
  action: "feedback" | "saved_stage" | "view" | "click" | "memo";
  admin: AdminClient;
  clearEmailAcceptanceConfirmation?: boolean;
  feedback?: TalentOpportunityFeedback | null;
  feedbackReason?: string | null;
  opportunityId: string;
  savedStage?: TalentOpportunitySavedStage | null;
  talentMemo?: string | null;
  userId: string;
}) {
  const rawOpportunityId = String(args.opportunityId ?? "").trim();
  const postingRoleId = getPostingRoleIdFromOpportunityId(rawOpportunityId);
  const opportunityId = postingRoleId
    ? await ensureTalentOpportunityRecommendationForPostingRole({
        admin: args.admin,
        roleId: postingRoleId,
        userId: args.userId,
      })
    : rawOpportunityId;
  if (!opportunityId) {
    throw new Error("opportunityId is required");
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {};

  if (args.action === "feedback") {
    payload.feedback = toDatabaseFeedback(args.feedback);
    payload.feedback_at = args.feedback ? now : null;
    payload.feedback_reason = args.feedback
      ? String(args.feedbackReason ?? "").trim() || null
      : null;
    payload.saved_stage =
      args.feedback === "positive"
        ? await resolvePositiveFeedbackSavedStage({
            admin: args.admin,
            opportunityId,
            requestedSavedStage: args.savedStage,
            userId: args.userId,
          })
        : null;
  } else if (args.action === "saved_stage") {
    payload.saved_stage = args.savedStage ?? null;
  } else if (args.action === "view") {
    payload.viewed_at = now;
  } else if (args.action === "memo") {
    payload.talent_memo = String(args.talentMemo ?? "").trim() || null;
  } else {
    payload.clicked_at = now;
  }

  const { error } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .update(payload)
    .eq("talent_id", args.userId)
    .eq("id", opportunityId) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to update opportunity state");
  }

  if (args.action === "feedback" && args.clearEmailAcceptanceConfirmation) {
    const { error: confirmationError } = await ((
      args.admin.from("talent_opportunity_recommendation" as any) as any
    )
      .update({ email_acceptance_confirmation: {} })
      .eq("talent_id", args.userId)
      .eq("id", opportunityId) as any);

    if (confirmationError) {
      console.warn(
        "[TalentOpportunity] failed to clear email acceptance confirmation",
        {
          error:
            confirmationError.message ??
            "Failed to clear email acceptance confirmation",
          opportunityId,
          userId: args.userId,
        }
      );
    }
  }

  return { ok: true, opportunityId, updatedAt: now };
}
