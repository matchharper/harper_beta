import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  DEFAULT_TALENT_PROFILE_VISIBILITY,
  ensureTalentUserRecord,
  fetchTalentInsights,
  fetchTalentSetting,
  getTalentSupabaseAdmin,
  normalizeTalentBlockedCompanies,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  sanitizeTalentProfileVisibility,
  upsertTalentInsights,
  upsertTalentSetting,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
  normalizeTalentRecommendationToggle,
} from "@/lib/talentOnboarding/recommendationSettings";
import {
  buildInsightActivitySummary,
  buildPreferenceActivitySummary,
  compactActivityChanges,
  getPreferenceActivityImpact,
  insertTalentActivityEvent,
  isSameActivityValue,
  type TalentActivityChange,
} from "@/lib/talentOnboarding/activityEvents";

const getLatestUpdatedAt = (...values: Array<string | null | undefined>) => {
  const timestamps = values
    .map((value) => {
      if (typeof value !== "string") return null;
      const time = Date.parse(value);
      if (Number.isNaN(time)) return null;
      return { time, value };
    })
    .filter(
      (entry): entry is { time: number; value: string } => entry !== null
    );

  if (timestamps.length === 0) return null;

  timestamps.sort((left, right) => right.time - left.time);
  return timestamps[0]?.value ?? null;
};

type Body = {
  engagementTypes?: string[];
  getExternalRecommendation?: boolean;
  getInternalRecommendation?: boolean;
  recommendationBatchSize?: number;
  insightContent?: Record<string, unknown> | null;
};

const toResponsePreferences = (
  setting?: {
    engagement_types?: string[] | null;
    get_external_recommendation?: boolean | null;
    get_internal_recommendation?: boolean | null;
    is_onboarding_done?: boolean | null;
    periodic_interval_days?: number | null;
    recommendation_batch_size?: number | null;
  } | null
) => {
  return {
    engagementTypes: normalizeTalentEngagementTypes(
      setting?.engagement_types ?? []
    ),
    getExternalRecommendation: normalizeTalentRecommendationToggle(
      setting?.get_external_recommendation
    ),
    getInternalRecommendation: normalizeTalentRecommendationToggle(
      setting?.get_internal_recommendation
    ),
    isOnboardingDone: Boolean(setting?.is_onboarding_done),
    periodicIntervalDays: normalizeTalentPeriodicIntervalDays(
      setting?.periodic_interval_days
    ),
    recommendationBatchSize: normalizeTalentRecommendationBatchSize(
      setting?.recommendation_batch_size
    ),
  };
};

const toResponseInsights = (insights?: { content?: unknown } | null) =>
  normalizeTalentInsightContent(insights?.content);

function getPreferenceActivityChanges(args: {
  body: Body;
  from: ReturnType<typeof toResponsePreferences>;
  to: ReturnType<typeof toResponsePreferences>;
}) {
  const changes: TalentActivityChange[] = [];
  if (args.body.engagementTypes !== undefined) {
    changes.push({
      field: "engagementTypes",
      from: args.from.engagementTypes,
      to: args.to.engagementTypes,
    });
  }
  if (args.body.getExternalRecommendation !== undefined) {
    changes.push({
      field: "getExternalRecommendation",
      from: args.from.getExternalRecommendation,
      to: args.to.getExternalRecommendation,
    });
  }
  if (args.body.getInternalRecommendation !== undefined) {
    changes.push({
      field: "getInternalRecommendation",
      from: args.from.getInternalRecommendation,
      to: args.to.getInternalRecommendation,
    });
  }
  if (args.body.recommendationBatchSize !== undefined) {
    changes.push({
      field: "recommendationBatchSize",
      from: args.from.recommendationBatchSize,
      to: args.to.recommendationBatchSize,
    });
  }
  return compactActivityChanges(changes);
}

function getInsightActivityChanges(args: {
  from: Record<string, string> | null;
  to: Record<string, string> | null;
}) {
  const from = args.from ?? {};
  const to = args.to ?? {};
  return Array.from(new Set([...Object.keys(from), ...Object.keys(to)]))
    .sort()
    .map((key) => ({
      field: key,
      from: from[key] ?? null,
      to: to[key] ?? null,
    }))
    .filter((change) => !isSameActivityValue(change.from, change.to));
}

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const [setting, insights] = await Promise.all([
      fetchTalentSetting({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
    ]);

    return NextResponse.json({
      ok: true,
      preferences: toResponsePreferences(setting),
      talentInsights: toResponseInsights(insights),
      preferencesUpdatedAt: setting?.updated_at ?? null,
      insightUpdatedAt: insights?.last_updated_at ?? null,
      updatedAt: getLatestUpdatedAt(
        setting?.updated_at ?? null,
        insights?.last_updated_at ?? null
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const [existingSetting, existingInsights] = await Promise.all([
      fetchTalentSetting({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
    ]);

    const hasPreferenceUpdate =
      body.engagementTypes !== undefined ||
      body.getExternalRecommendation !== undefined ||
      body.getInternalRecommendation !== undefined ||
      body.recommendationBatchSize !== undefined;
    const hasInsightUpdate = body.insightContent !== undefined;

    const savedSetting = hasPreferenceUpdate
      ? await upsertTalentSetting({
          admin,
          userId: user.id,
          profileVisibility: sanitizeTalentProfileVisibility(
            existingSetting?.profile_visibility ??
              DEFAULT_TALENT_PROFILE_VISIBILITY
          ),
          blockedCompanies: normalizeTalentBlockedCompanies(
            existingSetting?.blocked_companies ?? []
          ),
          engagementTypes: normalizeTalentEngagementTypes(
            body.engagementTypes ?? existingSetting?.engagement_types ?? []
          ),
          getExternalRecommendation: normalizeTalentRecommendationToggle(
            body.getExternalRecommendation ??
              existingSetting?.get_external_recommendation
          ),
          getInternalRecommendation: normalizeTalentRecommendationToggle(
            body.getInternalRecommendation ??
              existingSetting?.get_internal_recommendation
          ),
          recommendationBatchSize: normalizeTalentRecommendationBatchSize(
            body.recommendationBatchSize ??
              existingSetting?.recommendation_batch_size
          ),
        })
      : existingSetting;

    const savedInsights = hasInsightUpdate
      ? await upsertTalentInsights({
          admin,
          userId: user.id,
          content: normalizeTalentInsightContent(body.insightContent ?? null),
        })
      : existingInsights;

    const previousPreferences = toResponsePreferences(existingSetting);
    const nextPreferences = toResponsePreferences(savedSetting);
    const preferenceChanges = hasPreferenceUpdate
      ? getPreferenceActivityChanges({
          body,
          from: previousPreferences,
          to: nextPreferences,
        })
      : [];
    const preferenceSummary = buildPreferenceActivitySummary(preferenceChanges);
    if (preferenceSummary) {
      await insertTalentActivityEvent({
        admin,
        changedDomains: [
          "preferences",
          ...preferenceChanges.map((change) => change.field),
        ],
        eventType: "preferences_changed",
        impactLevel: getPreferenceActivityImpact(preferenceChanges),
        source: "profile_tab",
        summary: preferenceSummary,
        userId: user.id,
      });
    }

    const previousInsightContent = toResponseInsights(existingInsights);
    const nextInsightContent = toResponseInsights(savedInsights);
    const insightChanges = hasInsightUpdate
      ? getInsightActivityChanges({
          from: previousInsightContent,
          to: nextInsightContent,
        })
      : [];
    const insightSummary = buildInsightActivitySummary(
      insightChanges.map((change) => change.field)
    );
    if (insightSummary) {
      await insertTalentActivityEvent({
        admin,
        changedDomains: [
          "insights",
          ...insightChanges.map((change) => change.field),
        ],
        eventType: "insight_updated",
        impactLevel: "high",
        source: "profile_tab",
        summary: insightSummary,
        userId: user.id,
      });
    }

    return NextResponse.json({
      ok: true,
      opportunityDiscoveryQueued: false,
      opportunityRunId: null,
      preferences: toResponsePreferences(savedSetting),
      talentInsights: toResponseInsights(savedInsights),
      preferencesUpdatedAt: savedSetting?.updated_at ?? null,
      insightUpdatedAt: savedInsights?.last_updated_at ?? null,
      updatedAt: getLatestUpdatedAt(
        savedSetting?.updated_at ?? null,
        savedInsights?.last_updated_at ?? null
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
