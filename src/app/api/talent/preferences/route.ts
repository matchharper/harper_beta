import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  DEFAULT_TALENT_PROFILE_VISIBILITY,
  ensureTalentUserRecord,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistProgress,
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
import {
  resolveAccountSubscriptionUpdate,
  toAccountSubscriptionSettings,
} from "@/lib/career/accountSubscriptions";

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
  harperEnabled?: boolean;
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
    getInternalRecommendation: true,
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

const toResponseAccountSubscriptions = (
  setting?: {
    get_external_recommendation?: boolean | null;
    profile_visibility?: string | null;
  } | null
) =>
  toAccountSubscriptionSettings({
    getExternalRecommendation: normalizeTalentRecommendationToggle(
      setting?.get_external_recommendation
    ),
    profileVisibility: sanitizeTalentProfileVisibility(
      setting?.profile_visibility ?? DEFAULT_TALENT_PROFILE_VISIBILITY
    ),
  });

function getPreferenceActivityChanges(args: {
  body: Body;
  from: ReturnType<typeof toResponsePreferences>;
  fromProfileVisibility: string;
  to: ReturnType<typeof toResponsePreferences>;
  toProfileVisibility: string;
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
  if (args.body.harperEnabled !== undefined) {
    changes.push({
      field: "profileVisibility",
      from: args.fromProfileVisibility,
      to: args.toProfileVisibility,
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

    const [setting, insights, profile] = await Promise.all([
      fetchTalentSetting({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
      fetchTalentUserProfile({ admin, userId: user.id }),
    ]);
    const talentInsights = toResponseInsights(insights);
    const onboardingChecklistProgress = !Boolean(setting?.is_onboarding_done)
      ? await getCareerOnboardingChecklistProgress({
          admin,
          context: profile,
          currentInsightContent: talentInsights,
          userId: user.id,
        })
      : null;

    return NextResponse.json({
      ok: true,
      accountSubscriptions: toResponseAccountSubscriptions(setting),
      onboardingChecklistProgress,
      preferences: toResponsePreferences(setting),
      talentInsights,
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
    if (
      (body.getExternalRecommendation !== undefined &&
        typeof body.getExternalRecommendation !== "boolean") ||
      (body.harperEnabled !== undefined &&
        typeof body.harperEnabled !== "boolean")
    ) {
      return NextResponse.json(
        { error: "Invalid account subscription settings" },
        { status: 400 }
      );
    }
    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const [existingSetting, existingInsights, profile] = await Promise.all([
      fetchTalentSetting({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
      fetchTalentUserProfile({ admin, userId: user.id }),
    ]);

    const hasPreferenceUpdate =
      body.engagementTypes !== undefined ||
      body.getExternalRecommendation !== undefined ||
      body.harperEnabled !== undefined ||
      body.recommendationBatchSize !== undefined;
    const hasInsightUpdate = body.insightContent !== undefined;

    const accountSubscriptionUpdate = resolveAccountSubscriptionUpdate({
      currentGetExternalRecommendation: normalizeTalentRecommendationToggle(
        existingSetting?.get_external_recommendation
      ),
      currentProfileVisibility: sanitizeTalentProfileVisibility(
        existingSetting?.profile_visibility ?? DEFAULT_TALENT_PROFILE_VISIBILITY
      ),
      ...(body.getExternalRecommendation === undefined
        ? {}
        : { getExternalRecommendation: body.getExternalRecommendation }),
      ...(body.harperEnabled === undefined
        ? {}
        : { harperEnabled: body.harperEnabled }),
    });

    const savedSetting = hasPreferenceUpdate
      ? await upsertTalentSetting({
          admin,
          userId: user.id,
          profileVisibility: accountSubscriptionUpdate.profileVisibility,
          blockedCompanies: normalizeTalentBlockedCompanies(
            existingSetting?.blocked_companies ?? []
          ),
          engagementTypes: normalizeTalentEngagementTypes(
            body.engagementTypes ?? existingSetting?.engagement_types ?? []
          ),
          getExternalRecommendation:
            accountSubscriptionUpdate.getExternalRecommendation,
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
    const nextAccountSubscriptions =
      toResponseAccountSubscriptions(savedSetting);
    const preferenceChanges = hasPreferenceUpdate
      ? getPreferenceActivityChanges({
          body,
          from: previousPreferences,
          fromProfileVisibility: sanitizeTalentProfileVisibility(
            existingSetting?.profile_visibility ??
              DEFAULT_TALENT_PROFILE_VISIBILITY
          ),
          to: nextPreferences,
          toProfileVisibility: sanitizeTalentProfileVisibility(
            savedSetting?.profile_visibility ??
              DEFAULT_TALENT_PROFILE_VISIBILITY
          ),
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
        source:
          body.harperEnabled === undefined ? "profile_tab" : "account_settings",
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
    const responseInsights = toResponseInsights(savedInsights);
    const onboardingChecklistProgress = !Boolean(
      savedSetting?.is_onboarding_done
    )
      ? await getCareerOnboardingChecklistProgress({
          admin,
          context: profile,
          currentInsightContent: responseInsights,
          userId: user.id,
        })
      : null;

    return NextResponse.json({
      ok: true,
      accountSubscriptions: nextAccountSubscriptions,
      onboardingChecklistProgress,
      opportunityDiscoveryQueued: false,
      opportunityRunId: null,
      preferences: toResponsePreferences(savedSetting),
      talentInsights: responseInsights,
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
