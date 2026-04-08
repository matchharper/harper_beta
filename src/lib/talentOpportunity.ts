import type { Json } from "@/types/database.types";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type RawRecommendationRow = {
  clicked_at: string | null;
  dismissed_at: string | null;
  feedback: string | null;
  feedback_at: string | null;
  feedback_reason: string | null;
  id: string;
  kind: string;
  recommended_at: string;
  recommendation_reasons: Json;
  role_id: string;
  viewed_at: string | null;
  company_role:
    | {
        company_workspace:
          | {
              company_description: string | null;
              company_name: string;
              homepage_url: string | null;
              linkedin_url: string | null;
              logo_url: string | null;
            }
          | null;
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
      }
    | null;
};

export type TalentOpportunityFeedback =
  | "tracked"
  | "dont_know"
  | "not_for_me";

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
  postedAt: string | null;
  recommendedAt: string;
  recommendationReasons: string[];
  roleId: string;
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

function normalizeRecommendationKind(value: unknown): "match" | "recommendation" {
  return value === "match" ? "match" : "recommendation";
}

function normalizeSourceType(value: unknown): "internal" | "external" {
  return value === "external" ? "external" : "internal";
}

function normalizeFeedback(value: unknown): TalentOpportunityFeedback | null {
  if (value === "like") return "tracked";
  if (value === "neutral") return "dont_know";
  if (value === "dislike") return "not_for_me";
  return null;
}

export function toDatabaseFeedback(
  value: TalentOpportunityFeedback | null | undefined
): "like" | "neutral" | "dislike" | null {
  if (value === "tracked") return "like";
  if (value === "dont_know") return "neutral";
  if (value === "not_for_me") return "dislike";
  return null;
}

function normalizeRecommendationReasons(value: Json): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  if (value && typeof value === "object") {
    return Object.values(value)
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 8);
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
    postedAt: role.posted_at ?? null,
    recommendedAt: row.recommended_at,
    recommendationReasons: normalizeRecommendationReasons(
      row.recommendation_reasons
    ),
    roleId: String(row.role_id ?? ""),
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
  const { data, error } = await (((args.admin.from(
    "talent_opportunity_recommendation" as any
  ) as any)
    .select(
      `
        id,
        role_id,
        kind,
        recommended_at,
        recommendation_reasons,
        feedback,
        feedback_at,
        feedback_reason,
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
    .order("recommended_at", { ascending: false })) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent opportunities");
  }

  return coerceJsonArray<RawRecommendationRow>(data)
    .map(mapRecommendationRow)
    .filter((item): item is TalentOpportunityHistoryItem => item !== null);
}

export async function updateTalentOpportunityHistoryItem(args: {
  action: "feedback" | "view" | "click";
  admin: AdminClient;
  feedback?: TalentOpportunityFeedback | null;
  feedbackReason?: string | null;
  roleId: string;
  userId: string;
}) {
  const roleId = String(args.roleId ?? "").trim();
  if (!roleId) {
    throw new Error("roleId is required");
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {};

  if (args.action === "feedback") {
    payload.feedback = toDatabaseFeedback(args.feedback);
    payload.feedback_at = now;
    payload.feedback_reason = String(args.feedbackReason ?? "").trim() || null;
  } else if (args.action === "view") {
    payload.viewed_at = now;
  } else {
    payload.clicked_at = now;
  }

  const { error } = await (((args.admin.from(
    "talent_opportunity_recommendation" as any
  ) as any)
    .update(payload)
    .eq("talent_id", args.userId)
    .eq("role_id", roleId)) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to update opportunity state");
  }

  return { ok: true, updatedAt: now };
}
