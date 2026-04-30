import type { Json } from "@/types/database.types";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { OpportunityType, isOpportunityType } from "@/lib/opportunityType";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type RawRecommendationRow = {
  clicked_at: string | null;
  dismissed_at: string | null;
  feedback: string | null;
  feedback_at: string | null;
  feedback_reason: string | null;
  fit_summary: string | null;
  id: string;
  kind: string;
  opportunity_type: string | null;
  preference_fit: Json | null;
  recommended_at: string;
  recommendation_reasons: Json;
  role_id: string;
  saved_stage: string | null;
  tradeoffs: Json;
  viewed_at: string | null;
  company_role: {
    company_workspace: {
      company_description: string | null;
      company_name: string;
      homepage_url: string | null;
      linkedin_url: string | null;
      logo_url: string | null;
    } | null;
    description: string | null;
    external_jd_url: string | null;
    location_text: string | null;
    name: string;
    posted_at: string | null;
    role_id: string;
    source_job_id: string | null;
    source_provider: string | null;
    source_type: string;
    status: string;
    type: string[];
    work_mode: string | null;
  } | null;
};

const TALENT_OPPORTUNITY_HISTORY_SELECT = `
  id,
  role_id,
  kind,
  opportunity_type,
  preference_fit,
  fit_summary,
  recommended_at,
  recommendation_reasons,
  tradeoffs,
  feedback,
  feedback_at,
  feedback_reason,
  saved_stage,
  viewed_at,
  clicked_at,
  dismissed_at,
  company_role:company_roles!inner (
    role_id,
    name,
    description,
    external_jd_url,
    location_text,
    posted_at,
    type,
    work_mode,
    status,
    source_type,
    source_provider,
    source_job_id,
    company_workspace:company_workspace!inner (
      company_name,
      company_description,
      homepage_url,
      linkedin_url,
      logo_url
    )
  )
`;

export type TalentOpportunityFeedback = "positive" | "negative";

export { OpportunityType as TalentOpportunityType };

export type TalentOpportunitySavedStage =
  | "saved"
  | "applied"
  | "connected"
  | "closed";

export type TalentOpportunityHistoryItem = {
  clickedAt: string | null;
  companyDescription: string | null;
  companyHomepageUrl: string | null;
  companyLinkedinUrl: string | null;
  companyLogoUrl: string | null;
  companyName: string;
  description: string | null;
  dismissedAt: string | null;
  employmentTypes: string[];
  externalJdUrl: string | null;
  feedback: TalentOpportunityFeedback | null;
  feedbackAt: string | null;
  feedbackReason: string | null;
  href: string | null;
  id: string;
  isAccepted: boolean;
  isInternal: boolean;
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
  title: string;
  viewedAt: string | null;
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
  saved: number;
  savedStages: Record<TalentOpportunitySavedStage, number>;
  total: number;
};

type TalentOpportunitySourceType = "internal" | "external";

type RawSavedStageFallbackRow = {
  kind: string;
  opportunity_type: string | null;
  company_role: {
    source_type: string;
  } | null;
};

function coerceJsonArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeRecommendationKind(
  value: unknown
): "match" | "recommendation" {
  return value === "match" ? "match" : "recommendation";
}

function normalizeOpportunityType(args: {
  kind: "match" | "recommendation";
  sourceType: "internal" | "external";
  value: unknown;
}): OpportunityType {
  if (isOpportunityType(args.value)) return args.value;
  if (args.kind === "match") return OpportunityType.IntroRequest;
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
    value === "closed"
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

export function toDatabaseFeedback(
  value: TalentOpportunityFeedback | null | undefined
): "like" | "dislike" | null {
  if (value === "positive") return "like";
  if (value === "negative") return "dislike";
  return null;
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
  saved: 0,
  savedStages: {
    saved: 0,
    applied: 0,
    connected: 0,
    closed: 0,
  },
  total: 0,
});

const getDefaultSavedStageForOpportunityType = (
  opportunityType: OpportunityType
): TalentOpportunitySavedStage => {
  if (opportunityType === OpportunityType.IntroRequest) return "connected";
  if (opportunityType === OpportunityType.InternalRecommendation) {
    return "applied";
  }
  return "saved";
};

function buildTalentOpportunityHistoryQuery(args: {
  admin: AdminClient;
  sourceType?: TalentOpportunitySourceType;
  userId: string;
}) {
  let query = (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(TALENT_OPPORTUNITY_HISTORY_SELECT)
    .eq("talent_id", args.userId)
    .order("recommended_at", { ascending: false }) as any;

  if (args.sourceType) {
    query = query.eq("company_role.source_type", args.sourceType);
  }

  return query;
}

async function countTalentOpportunityRecommendations(args: {
  admin: AdminClient;
  feedback: "like" | "dislike" | null;
  savedStage?: TalentOpportunitySavedStage;
  userId: string;
}) {
  let query = (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      "id, company_role:company_roles!inner(source_type, company_workspace:company_workspace!inner(company_name))",
      { count: "exact", head: true }
    )
    .eq("talent_id", args.userId) as any;

  query =
    args.feedback === null
      ? query.is("feedback", null)
      : query.eq("feedback", args.feedback);

  if (args.savedStage) {
    query = query.eq("saved_stage", args.savedStage);
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
        kind,
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
    savedCount,
    archivedCount,
    savedStageCount,
    appliedStageCount,
    connectedStageCount,
    closedStageCount,
    savedRowsMissingStage,
  ] = await Promise.all([
    countTalentOpportunityRecommendations({
      admin: args.admin,
      feedback: null,
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      feedback: "like",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      feedback: "dislike",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      feedback: "like",
      savedStage: "saved",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      feedback: "like",
      savedStage: "applied",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      feedback: "like",
      savedStage: "connected",
      userId: args.userId,
    }),
    countTalentOpportunityRecommendations({
      admin: args.admin,
      feedback: "like",
      savedStage: "closed",
      userId: args.userId,
    }),
    fetchSavedRowsMissingStage({
      admin: args.admin,
      userId: args.userId,
    }),
  ]);

  const counts = createEmptyHistoryCounts();
  counts.new = newCount;
  counts.saved = savedCount;
  counts.archived = archivedCount;
  counts.total = newCount + savedCount + archivedCount;
  counts.savedStages.saved = savedStageCount;
  counts.savedStages.applied = appliedStageCount;
  counts.savedStages.connected = connectedStageCount;
  counts.savedStages.closed = closedStageCount;

  for (const row of savedRowsMissingStage) {
    const kind = normalizeRecommendationKind(row.kind);
    const sourceType = normalizeSourceType(row.company_role?.source_type);
    const opportunityType = normalizeOpportunityType({
      kind,
      sourceType,
      value: row.opportunity_type,
    });
    const defaultStage =
      getDefaultSavedStageForOpportunityType(opportunityType);
    counts.savedStages[defaultStage] += 1;
  }

  return counts;
}

function mapRecommendationRow(
  row: RawRecommendationRow
): TalentOpportunityHistoryItem | null {
  const role = row.company_role;
  const workspace = role?.company_workspace;
  if (!role || !workspace) return null;

  const sourceType = normalizeSourceType(role.source_type);
  const externalJdUrl = role.external_jd_url ?? null;
  const homepageUrl = workspace.homepage_url ?? null;
  const linkedinUrl = workspace.linkedin_url ?? null;
  const href = externalJdUrl || homepageUrl || linkedinUrl || null;
  const kind = normalizeRecommendationKind(row.kind);
  const opportunityType = normalizeOpportunityType({
    kind,
    sourceType,
    value: row.opportunity_type,
  });

  return {
    clickedAt: row.clicked_at ?? null,
    companyDescription: workspace.company_description ?? null,
    companyHomepageUrl: homepageUrl,
    companyLinkedinUrl: linkedinUrl,
    companyLogoUrl: workspace.logo_url ?? null,
    companyName: String(workspace.company_name ?? ""),
    description: role.description ?? null,
    dismissedAt: row.dismissed_at ?? null,
    employmentTypes: Array.isArray(role.type) ? role.type : [],
    externalJdUrl,
    feedback: normalizeFeedback(row.feedback),
    feedbackAt: row.feedback_at ?? null,
    feedbackReason: row.feedback_reason ?? null,
    href,
    id: String(row.id ?? ""),
    isAccepted: kind === "match",
    isInternal: sourceType === "internal",
    kind,
    location: role.location_text ?? null,
    opportunityType,
    postedAt: role.posted_at ?? null,
    preferenceFit: normalizePreferenceFit(row.preference_fit ?? null),
    recommendedAt: row.recommended_at,
    recommendationConcerns: normalizeTextList(row.tradeoffs, 3),
    recommendationReasons: normalizeTextList(row.recommendation_reasons),
    recommendationSummary: row.fit_summary ?? null,
    roleId: String(row.role_id ?? ""),
    savedStage: normalizeSavedStage(row.saved_stage),
    sourceJobId: role.source_job_id ?? null,
    sourceProvider: role.source_provider ?? null,
    sourceType,
    status: String(role.status ?? "active"),
    title: String(role.name ?? ""),
    viewedAt: row.viewed_at ?? null,
    workMode: role.work_mode ?? null,
  };
}

export async function fetchTalentOpportunityHistory(args: {
  admin: AdminClient;
  limit?: number;
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

  return coerceJsonArray<RawRecommendationRow>(data)
    .map(mapRecommendationRow)
    .filter((item): item is TalentOpportunityHistoryItem => item !== null);
}

export async function fetchTalentOpportunityHistoryPage(args: {
  admin: AdminClient;
  limit?: number;
  offset?: number;
  userId: string;
}): Promise<TalentOpportunityHistoryPage> {
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(Math.floor(args.limit), 100))
      : 20;
  const offset =
    typeof args.offset === "number" && Number.isFinite(args.offset)
      ? Math.max(0, Math.floor(args.offset))
      : 0;
  const [externalItems, internalItems, counts] = await Promise.all([
    fetchTalentOpportunityHistory({
      admin: args.admin,
      limit,
      offset,
      sourceType: "external",
      userId: args.userId,
    }),
    offset === 0
      ? fetchTalentOpportunityHistory({
          admin: args.admin,
          sourceType: "internal",
          userId: args.userId,
        })
      : Promise.resolve([]),
    fetchTalentOpportunityHistoryCounts({
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

  return coerceJsonArray<RawRecommendationRow>(data)
    .map(mapRecommendationRow)
    .filter((item): item is TalentOpportunityHistoryItem => item !== null);
}

export async function updateTalentOpportunityHistoryItem(args: {
  action: "feedback" | "saved_stage" | "view" | "click";
  admin: AdminClient;
  feedback?: TalentOpportunityFeedback | null;
  feedbackReason?: string | null;
  opportunityId: string;
  savedStage?: TalentOpportunitySavedStage | null;
  userId: string;
}) {
  const opportunityId = String(args.opportunityId ?? "").trim();
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
      args.feedback === "positive" ? (args.savedStage ?? null) : null;
    payload.dismissed_at = args.feedback === "negative" ? now : null;
  } else if (args.action === "saved_stage") {
    payload.saved_stage = args.savedStage ?? null;
  } else if (args.action === "view") {
    payload.viewed_at = now;
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

  return { ok: true, updatedAt: now };
}

export async function createTalentOpportunityQuestion(args: {
  admin: AdminClient;
  opportunityId: string;
  question: string;
  userId: string;
}) {
  const opportunityId = String(args.opportunityId ?? "").trim();
  if (!opportunityId) {
    throw new Error("opportunityId is required");
  }

  const question = String(args.question ?? "").trim();
  if (!question) {
    throw new Error("question is required");
  }

  const { data: opportunity, error: lookupError } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select("role_id")
    .eq("talent_id", args.userId)
    .eq("id", opportunityId)
    .maybeSingle() as any);

  if (lookupError) {
    throw new Error(lookupError.message ?? "Failed to load opportunity");
  }

  const roleId =
    typeof opportunity?.role_id === "string" ? opportunity.role_id.trim() : "";
  if (!roleId) {
    throw new Error("Opportunity not found");
  }

  const content = `Role:${roleId}\n${question}`;
  const { data: insertedMessage, error: insertError } = await args.admin
    .from("talent_messages")
    .insert({
      conversation_id: null,
      user_id: args.userId,
      role: "user",
      content,
      message_type: "question",
    })
    .select("id, created_at")
    .single();

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to save question");
  }

  return {
    ok: true,
    createdAt: insertedMessage.created_at,
    messageId: insertedMessage.id,
    roleId,
  };
}
