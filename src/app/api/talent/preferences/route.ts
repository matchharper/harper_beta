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

type Body = {
  engagementTypes?: string[];
  preferredLocations?: string[];
  careerMoveIntent?: string | null;
  technicalStrengths?: string | null;
  desiredTeams?: string | null;
};

const toResponsePreferences = (args: {
  setting?: {
    engagement_types?: string[] | null;
    preferred_locations?: string[] | null;
    career_move_intent?: string | null;
  } | null;
  insights?: {
    content?: unknown;
  } | null;
}) => {
  const normalizedInsights = normalizeTalentInsightContent(args.insights?.content);
  const careerMoveIntent = sanitizeTalentCareerMoveIntent(
    args.setting?.career_move_intent
  );

  return {
    engagementTypes: normalizeTalentEngagementTypes(
      args.setting?.engagement_types ?? []
    ),
    preferredLocations: normalizeTalentPreferredLocations(
      args.setting?.preferred_locations ?? []
    ),
    careerMoveIntent,
    careerMoveIntentLabel: getTalentCareerMoveIntentLabel(careerMoveIntent),
    technicalStrengths: normalizedInsights?.technical_strengths ?? null,
    desiredTeams: normalizedInsights?.desired_teams ?? null,
  };
};

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
      preferences: toResponsePreferences({ setting, insights }),
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

    const [existingSetting] = await Promise.all([
      fetchTalentSetting({ admin, userId: user.id }),
    ]);

    const savedSetting = await upsertTalentSetting({
      admin,
      userId: user.id,
      profileVisibility: sanitizeTalentProfileVisibility(
        existingSetting?.profile_visibility ?? DEFAULT_TALENT_PROFILE_VISIBILITY
      ),
      blockedCompanies: normalizeTalentBlockedCompanies(
        existingSetting?.blocked_companies ?? []
      ),
      engagementTypes: normalizeTalentEngagementTypes(body.engagementTypes ?? []),
      preferredLocations: normalizeTalentPreferredLocations(
        body.preferredLocations ?? []
      ),
      careerMoveIntent: sanitizeTalentCareerMoveIntent(body.careerMoveIntent),
    });

    const savedInsights = await upsertTalentInsights({
      admin,
      userId: user.id,
      content: {
        technical_strengths: body.technicalStrengths ?? null,
        desired_teams: body.desiredTeams ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      preferences: toResponsePreferences({
        setting: savedSetting,
        insights: savedInsights,
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
