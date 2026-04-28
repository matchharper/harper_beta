import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  DEFAULT_TALENT_PROFILE_VISIBILITY,
  ensureTalentUserRecord,
  fetchTalentSetting,
  getTalentSupabaseAdmin,
  normalizeTalentBlockedCompanies,
  sanitizeTalentProfileVisibility,
  upsertTalentSetting,
} from "@/lib/talentOnboarding/server";

type Body = {
  profileVisibility?: string;
  blockedCompanies?: string[];
};

const toResponseSettings = (row: {
  profile_visibility?: string | null;
  blocked_companies?: string[] | null;
}) => ({
  profileVisibility: sanitizeTalentProfileVisibility(row.profile_visibility),
  blockedCompanies: normalizeTalentBlockedCompanies(row.blocked_companies),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const row = await fetchTalentSetting({ admin, userId: user.id });
    if (!row) {
      const saved = await upsertTalentSetting({
        admin,
        userId: user.id,
        profileVisibility: DEFAULT_TALENT_PROFILE_VISIBILITY,
        blockedCompanies: [],
      });
      return NextResponse.json({
        ok: true,
        settings: toResponseSettings(saved),
        updatedAt: saved.updated_at ?? null,
      });
    }

    return NextResponse.json({
      ok: true,
      settings: toResponseSettings(row),
      updatedAt: row.updated_at ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load settings";
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

    const existing = await fetchTalentSetting({ admin, userId: user.id });

    const profileVisibility = sanitizeTalentProfileVisibility(
      body.profileVisibility ??
        existing?.profile_visibility ??
        DEFAULT_TALENT_PROFILE_VISIBILITY
    );
    const blockedCompanies = normalizeTalentBlockedCompanies(
      body.blockedCompanies ?? existing?.blocked_companies ?? []
    );

    const saved = await upsertTalentSetting({
      admin,
      userId: user.id,
      profileVisibility,
      blockedCompanies,
      engagementTypes: existing?.engagement_types ?? [],
      preferredLocations: existing?.preferred_locations ?? [],
      careerMoveIntent: existing?.career_move_intent ?? null,
    });

    return NextResponse.json({
      ok: true,
      settings: toResponseSettings(saved),
      updatedAt: saved.updated_at ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
