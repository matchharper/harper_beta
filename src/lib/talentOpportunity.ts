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
    recommendedAt: row.recommended_at,
    recommendationConcerns: normalizeTextList(row.tradeoffs, 3),
    recommendationReasons: normalizeTextList(
      row.recommendation_reasons
    ),
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
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      `
        id,
        role_id,
        kind,
        opportunity_type,
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
        company_role:company_roles (
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
          company_workspace:company_workspace (
            company_name,
            company_description,
            homepage_url,
            linkedin_url,
            logo_url
          )
        )
      `
    )
    .eq("talent_id", args.userId)
    .order("recommended_at", { ascending: false }) as any);

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
