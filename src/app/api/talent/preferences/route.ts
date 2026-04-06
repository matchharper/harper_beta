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
  normalizeTalentPreferredLocations,
  sanitizeTalentCareerMoveIntent,
  sanitizeTalentProfileVisibility,
  upsertTalentInsights,
  upsertTalentSetting,
} from "@/lib/talentOnboarding/server";
import { getTalentCareerMoveIntentLabel } from "@/lib/talentNetworkApplication";

const getLatestUpdatedAt = (...values: Array<string | null | undefined>) => {
  const timestamps = values
    .map((value) => {
      if (typeof value !== "string") return null;
      const time = Date.parse(value);
      if (Number.isNaN(time)) return null;
      return { time, value };
    })
    .filter((entry): entry is { time: number; value: string } => entry !== null);

  if (timestamps.length === 0) return null;

  timestamps.sort((left, right) => right.time - left.time);
  return timestamps[0]?.value ?? null;
};

type Body = {
  engagementTypes?: string[];
  preferredLocations?: string[];
  careerMoveIntent?: string | null;
  insightContent?: Record<string, unknown> | null;
};

const toResponsePreferences = (setting?: {
  engagement_types?: string[] | null;
  preferred_locations?: string[] | null;
  career_move_intent?: string | null;
} | null) => {
  const careerMoveIntent = sanitizeTalentCareerMoveIntent(
    setting?.career_move_intent
  );

  return {
    engagementTypes: normalizeTalentEngagementTypes(
      setting?.engagement_types ?? []
    ),
    preferredLocations: normalizeTalentPreferredLocations(
      setting?.preferred_locations ?? []
    ),
    careerMoveIntent,
    careerMoveIntentLabel: getTalentCareerMoveIntentLabel(careerMoveIntent),
  };
};

const toResponseInsights = (insights?: { content?: unknown } | null) =>
  normalizeTalentInsightContent(insights?.content);

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
      body.preferredLocations !== undefined ||
      body.careerMoveIntent !== undefined;
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
          preferredLocations: normalizeTalentPreferredLocations(
            body.preferredLocations ?? existingSetting?.preferred_locations ?? []
          ),
          careerMoveIntent: sanitizeTalentCareerMoveIntent(
            body.careerMoveIntent ?? existingSetting?.career_move_intent
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

    return NextResponse.json({
      ok: true,
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
