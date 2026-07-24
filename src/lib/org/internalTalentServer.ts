import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type {
  OrgInternalRecommendationStats,
  OrgInternalTalentSystemResponse,
} from "@/lib/org/internalTalentTypes";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function getFirstRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function latestIso(values: Array<string | null | undefined>) {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time <= latestTime) continue;
    latest = value;
    latestTime = time;
  }
  return latest;
}

function emptyStats(): OrgInternalRecommendationStats {
  return { accepted: 0, noResponse: 0, rejected: 0, total: 0 };
}

function recommendationResponse(
  feedback: unknown,
  savedStage: unknown
): "accepted" | "no_response" | "rejected" {
  const normalizedFeedback = normalizeText(feedback).toLowerCase();
  const normalizedStage = normalizeText(savedStage).toLowerCase();
  if (
    ["like", "positive"].includes(normalizedFeedback) ||
    normalizedStage === "accepted"
  ) {
    return "accepted";
  }
  if (
    ["dislike", "negative"].includes(normalizedFeedback) ||
    ["rejected", "dismissed"].includes(normalizedStage)
  ) {
    return "rejected";
  }
  return "no_response";
}

export async function fetchOrgInternalTalentSystem(args: {
  talentId: string;
}): Promise<OrgInternalTalentSystemResponse> {
  const talentId = normalizeText(args.talentId);
  if (!talentId) throw new Error("talentId is required");

  const admin = getSupabaseAdmin();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    talentResult,
    settingResult,
    conversationResult,
    messageResult,
    recentRecommendationsResult,
    activityRecommendationsResult,
  ] = await Promise.all([
    (admin.from("talent_users" as any) as any)
      .select("user_id, created_at, updated_at, last_logined_at")
      .eq("user_id", talentId)
      .maybeSingle(),
    (admin.from("talent_setting" as any) as any)
      .select(
        "status, status_updated_at, updated_at, is_onboarding_done, get_external_recommendation, get_internal_recommendation, profile_visibility"
      )
      .eq("user_id", talentId)
      .maybeSingle(),
    (admin.from("talent_conversations" as any) as any)
      .select("updated_at")
      .eq("user_id", talentId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (admin.from("talent_messages" as any) as any)
      .select("created_at")
      .eq("user_id", talentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (admin.from("talent_opportunity_recommendation" as any) as any)
      .select(
        "feedback, saved_stage, opportunity_type, recommended_at, company_role:company_roles(source_type)"
      )
      .eq("talent_id", talentId)
      .gte("recommended_at", since)
      .order("recommended_at", { ascending: false })
      .limit(1000),
    (admin.from("talent_opportunity_recommendation" as any) as any)
      .select("viewed_at, clicked_at, feedback_at")
      .eq("talent_id", talentId)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  for (const result of [
    talentResult,
    settingResult,
    conversationResult,
    messageResult,
    recentRecommendationsResult,
    activityRecommendationsResult,
  ]) {
    if (result.error) throw result.error;
  }
  if (!talentResult.data) throw new Error("Talent not found");

  const external = emptyStats();
  const internal = emptyStats();
  for (const row of recentRecommendationsResult.data ?? []) {
    const role = getFirstRecord(
      row.company_role as
        | { source_type?: string | null }
        | Array<{ source_type?: string | null }>
        | null
    );
    const opportunityType = normalizeText(row.opportunity_type).toLowerCase();
    const isInternal =
      normalizeText(role?.source_type).toLowerCase() === "internal" ||
      ["internal_recommendation", "intro_request"].includes(opportunityType);
    const stats = isInternal ? internal : external;
    const response = recommendationResponse(row.feedback, row.saved_stage);
    stats.total += 1;
    stats[response === "no_response" ? "noResponse" : response] += 1;
  }

  const recommendationActivity = (activityRecommendationsResult.data ?? [])
    .flatMap((row: any) => [row.viewed_at, row.clicked_at, row.feedback_at])
    .filter((value: unknown): value is string => typeof value === "string");
  const talent = talentResult.data as {
    created_at?: string | null;
    last_logined_at?: string | null;
    updated_at?: string | null;
  };
  const setting = settingResult.data as
    | {
        get_external_recommendation?: boolean | null;
        get_internal_recommendation?: boolean | null;
        is_onboarding_done?: boolean | null;
        profile_visibility?: string | null;
        status?: string | null;
        status_updated_at?: string | null;
        updated_at?: string | null;
      }
    | null;

  return {
    account: {
      createdAt: talent.created_at ?? null,
      externalRecommendationsEnabled:
        setting?.get_external_recommendation === true,
      internalRecommendationsEnabled:
        setting?.get_internal_recommendation === true,
      isOnboardingDone: setting?.is_onboarding_done === true,
      lastActiveAt: latestIso([
        talent.last_logined_at,
        talent.updated_at,
        setting?.updated_at,
        conversationResult.data?.updated_at,
        messageResult.data?.created_at,
        ...recommendationActivity,
      ]),
      lastLoginAt: talent.last_logined_at ?? null,
      profileVisibility: setting?.profile_visibility ?? null,
      status: setting?.status ?? null,
      statusUpdatedAt: setting?.status_updated_at ?? null,
    },
    recent7Days: { external, internal, since },
    talentId,
  };
}
