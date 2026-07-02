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
import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";
import { insertTalentActivityEvent } from "@/lib/talentOnboarding/activityEvents";

type Body = {
  profileVisibility?: string;
  profileVisibilitySource?: string;
  blockedCompanies?: string[];
  preferredLocale?: string | null;
};

const normalizeProfileVisibilityActivitySource = (value: unknown) => {
  const source = String(value ?? "").trim();
  return source === "onboarding" ? "onboarding" : "profile_settings";
};

const toResponseSettings = (row: {
  profile_visibility?: string | null;
  blocked_companies?: string[] | null;
  preferred_locale?: string | null;
  setting_locale?: string | null;
}) => ({
  profileVisibility: sanitizeTalentProfileVisibility(row.profile_visibility),
  blockedCompanies: normalizeTalentBlockedCompanies(row.blocked_companies),
  preferredLocale: normalizeCareerPromptLocale(
    row.setting_locale ?? row.preferred_locale
  ),
  effectivePreferredLocale: normalizeCareerPromptLocale(row.preferred_locale),
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
        preferredLocale: normalizeCareerPromptLocale(
          req.cookies.get("NEXT_LOCALE")?.value
        ),
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
    const previousProfileVisibility = sanitizeTalentProfileVisibility(
      existing?.profile_visibility ?? DEFAULT_TALENT_PROFILE_VISIBILITY
    );

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
      ...(body.preferredLocale === undefined
        ? {}
        : { settingLocale: normalizeCareerPromptLocale(body.preferredLocale) }),
    });
    const savedProfileVisibility = sanitizeTalentProfileVisibility(
      saved.profile_visibility
    );
    if (
      body.profileVisibility !== undefined &&
      previousProfileVisibility !== savedProfileVisibility
    ) {
      await insertTalentActivityEvent({
        admin,
        changedDomains: ["preferences", "profile_visibility"],
        eventType: "profile_visibility_changed",
        impactLevel: "medium",
        source: normalizeProfileVisibilityActivitySource(
          body.profileVisibilitySource
        ),
        summary: `User changed profile visibility from "${previousProfileVisibility}" to "${savedProfileVisibility}".`,
        userId: user.id,
      });
    }

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
