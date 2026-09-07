import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  DEFAULT_TALENT_PROFILE_VISIBILITY,
  ensureTalentUserRecord,
  fetchTalentContexts,
  fetchTalentContextsUpdatedAt,
  fetchTalentSetting,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistProgress,
  getTalentSupabaseAdmin,
  normalizeTalentBlockedCompanies,
  normalizeTalentEngagementTypes,
  projectBriefsToLegacyInsights,
  sanitizeTalentProfileVisibility,
  upsertTalentSetting,
  toTalentContextResponse,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
  normalizeTalentRecommendationToggle,
} from "@/lib/talentOnboarding/recommendationSettings";
import {
  buildPreferenceActivitySummary,
  compactActivityChanges,
  getPreferenceActivityImpact,
  insertTalentActivityEvent,
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

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const [setting, brief, talentContextsUpdatedAt, profile] = await Promise.all([
      fetchTalentSetting({ admin, userId: user.id }),
      fetchTalentContexts({
        admin,
        collection: "brief",
        limit: 500,
        userId: user.id,
      }),
      fetchTalentContextsUpdatedAt({ admin, userId: user.id }),
      fetchTalentUserProfile({ admin, userId: user.id }),
    ]);
    const talentInsights = projectBriefsToLegacyInsights(brief);
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
      talentBrief: brief.map(toTalentContextResponse),
      talentContextsUpdatedAt,
      preferencesUpdatedAt: setting?.updated_at ?? null,
      insightUpdatedAt: talentContextsUpdatedAt,
      updatedAt: getLatestUpdatedAt(
        setting?.updated_at ?? null,
        talentContextsUpdatedAt
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
    if (body.insightContent !== undefined) {
      return NextResponse.json(
        { error: "Use /api/talent/contexts for Search Brief and Memory edits" },
        { status: 400 }
      );
    }
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

    const [existingSetting, brief, talentContextsUpdatedAt, profile] =
      await Promise.all([
      fetchTalentSetting({ admin, userId: user.id }),
      fetchTalentContexts({
        admin,
        collection: "brief",
        limit: 500,
        userId: user.id,
      }),
      fetchTalentContextsUpdatedAt({ admin, userId: user.id }),
      fetchTalentUserProfile({ admin, userId: user.id }),
    ]);

    const hasPreferenceUpdate =
      body.engagementTypes !== undefined ||
      body.getExternalRecommendation !== undefined ||
      body.harperEnabled !== undefined ||
      body.recommendationBatchSize !== undefined;

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

    const responseInsights = projectBriefsToLegacyInsights(brief);
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
      talentBrief: brief.map(toTalentContextResponse),
      talentContextsUpdatedAt,
      preferencesUpdatedAt: savedSetting?.updated_at ?? null,
      insightUpdatedAt: talentContextsUpdatedAt,
      updatedAt: getLatestUpdatedAt(
        savedSetting?.updated_at ?? null,
        talentContextsUpdatedAt
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
