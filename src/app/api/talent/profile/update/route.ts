import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

type StructuredProfileBody = {
  talentUser?: {
    user_id?: string | null;
    name?: string | null;
    profile_picture?: string | null;
    headline?: string | null;
    bio?: string | null;
    location?: string | null;
  } | null;
  talentExperiences?: Array<{
    company_id?: string | null;
    company_link?: string | null;
    company_location?: string | null;
    company_logo?: string | null;
    company_name?: string | null;
    description?: string | null;
    end_date?: string | null;
    memo?: string | null;
    months?: number | null;
    role?: string | null;
    start_date?: string | null;
  }> | null;
  talentEducations?: Array<{
    degree?: string | null;
    description?: string | null;
    end_date?: string | null;
    field?: string | null;
    memo?: string | null;
    school?: string | null;
    start_date?: string | null;
    url?: string | null;
  }> | null;
  talentExtras?: Array<{
    title?: string | null;
    description?: string | null;
    date?: string | null;
    memo?: string | null;
  }> | null;
} | null;

type Body = {
  resumeFileName?: string;
  resumeStoragePath?: string;
  resumeText?: string;
  links?: string[];
  structuredProfile?: StructuredProfileBody;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const sanitizeSingleLineText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const sanitizeMultilineText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const sanitizeDateText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, 32);
};

const sanitizeInteger = (
  value: unknown,
  minValue: number,
  maxValue: number
) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.round(value);
  if (normalized < minValue || normalized > maxValue) return null;
  return normalized;
};

const normalizeStructuredProfile = (
  raw: StructuredProfileBody,
  userId: string
) => {
  const record = asRecord(raw);
  if (!record) return null;

  const talentUserRecord = asRecord(record.talentUser);
  const talentUser = {
    user_id: userId,
    name: sanitizeSingleLineText(talentUserRecord?.name, 120),
    profile_picture: sanitizeSingleLineText(
      talentUserRecord?.profile_picture,
      2000
    ),
    headline: sanitizeSingleLineText(talentUserRecord?.headline, 240),
    bio: sanitizeMultilineText(talentUserRecord?.bio, 8000),
    location: sanitizeSingleLineText(talentUserRecord?.location, 240),
  };

  const talentExperiences = (Array.isArray(record.talentExperiences)
    ? record.talentExperiences
    : []
  )
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;

      const normalized = {
        talent_id: userId,
        role: sanitizeSingleLineText(row.role, 240),
        description: sanitizeMultilineText(row.description, 8000),
        start_date: sanitizeDateText(row.start_date),
        end_date: sanitizeDateText(row.end_date),
        months: sanitizeInteger(row.months, 0, 1200),
        company_id: sanitizeSingleLineText(row.company_id, 120),
        company_link: sanitizeSingleLineText(row.company_link, 2000),
        company_name: sanitizeSingleLineText(row.company_name, 240),
        company_location: sanitizeSingleLineText(row.company_location, 240),
        company_logo: sanitizeSingleLineText(row.company_logo, 2000),
        memo: sanitizeMultilineText(row.memo, 2000),
      };

      const hasContent = Object.entries(normalized).some(
        ([key, value]) => key !== "talent_id" && Boolean(value)
      );
      return hasContent ? normalized : null;
    })
    .filter(
      (
        item
      ): item is {
        talent_id: string;
        role: string | null;
        description: string | null;
        start_date: string | null;
        end_date: string | null;
        months: number | null;
        company_id: string | null;
        company_link: string | null;
        company_name: string | null;
        company_location: string | null;
        company_logo: string | null;
        memo: string | null;
      } => Boolean(item)
    );

  const talentEducations = (Array.isArray(record.talentEducations)
    ? record.talentEducations
    : []
  )
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;

      const normalized = {
        talent_id: userId,
        school: sanitizeSingleLineText(row.school, 240),
        degree: sanitizeSingleLineText(row.degree, 120),
        description: sanitizeMultilineText(row.description, 8000),
        field: sanitizeSingleLineText(row.field, 240),
        start_date: sanitizeDateText(row.start_date),
        end_date: sanitizeDateText(row.end_date),
        url: sanitizeSingleLineText(row.url, 2000),
        memo: sanitizeMultilineText(row.memo, 2000),
      };

      const hasContent = Object.entries(normalized).some(
        ([key, value]) => key !== "talent_id" && Boolean(value)
      );
      return hasContent ? normalized : null;
    })
    .filter(
      (
        item
      ): item is {
        talent_id: string;
        school: string | null;
        degree: string | null;
        description: string | null;
        field: string | null;
        start_date: string | null;
        end_date: string | null;
        url: string | null;
        memo: string | null;
      } => Boolean(item)
    );

  const talentExtras = (Array.isArray(record.talentExtras)
    ? record.talentExtras
    : []
  )
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;

      const normalized = {
        title: sanitizeSingleLineText(row.title, 240),
        description: sanitizeMultilineText(row.description, 8000),
        date: sanitizeDateText(row.date),
        memo: sanitizeMultilineText(row.memo, 2000),
      };

      const hasContent = Object.values(normalized).some(Boolean);
      return hasContent ? normalized : null;
    })
    .filter(
      (
        item
      ): item is {
        title: string | null;
        description: string | null;
        date: string | null;
        memo: string | null;
      } => Boolean(item)
    );

  return {
    talentUser,
    talentExperiences,
    talentEducations,
    talentExtras,
  };
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const resumeFileName = body.resumeFileName?.trim();
    const resumeStoragePath = body.resumeStoragePath?.trim();
    const resumeText = body.resumeText?.trim();
    const links = (body.links ?? [])
      .map((link) => String(link).trim())
      .filter(Boolean);
    const structuredProfile = normalizeStructuredProfile(
      body.structuredProfile ?? null,
      user.id
    );
    const now = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      updated_at: now,
      resume_links: links,
    };

    if (resumeFileName) {
      updatePayload.resume_file_name = resumeFileName;
    }
    if (resumeStoragePath) {
      updatePayload.resume_storage_path = resumeStoragePath;
    }
    if (typeof resumeText === "string") {
      updatePayload.resume_text = resumeText.slice(0, 20000);
    }
    if (structuredProfile) {
      updatePayload.name = structuredProfile.talentUser.name;
      updatePayload.profile_picture = structuredProfile.talentUser.profile_picture;
      updatePayload.headline = structuredProfile.talentUser.headline;
      updatePayload.bio = structuredProfile.talentUser.bio;
      updatePayload.location = structuredProfile.talentUser.location;
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const { error: updateError } = await admin
      .from("talent_users")
      .update(updatePayload)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message ?? "Failed to update profile" },
        { status: 500 }
      );
    }

    if (structuredProfile) {
      const db = admin as any;

      const { error: expDeleteError } = await db
        .from("talent_experiences")
        .delete()
        .eq("talent_id", user.id);
      if (expDeleteError) {
        return NextResponse.json(
          {
            error:
              expDeleteError.message ?? "Failed to replace talent experiences",
          },
          { status: 500 }
        );
      }

      const { error: eduDeleteError } = await db
        .from("talent_educations")
        .delete()
        .eq("talent_id", user.id);
      if (eduDeleteError) {
        return NextResponse.json(
          {
            error:
              eduDeleteError.message ?? "Failed to replace talent educations",
          },
          { status: 500 }
        );
      }

      if (structuredProfile.talentExperiences.length > 0) {
        const { error: expInsertError } = await db
          .from("talent_experiences")
          .insert(structuredProfile.talentExperiences);
        if (expInsertError) {
          return NextResponse.json(
            {
              error:
                expInsertError.message ?? "Failed to save talent experiences",
            },
            { status: 500 }
          );
        }
      }

      if (structuredProfile.talentEducations.length > 0) {
        const { error: eduInsertError } = await db
          .from("talent_educations")
          .insert(structuredProfile.talentEducations);
        if (eduInsertError) {
          return NextResponse.json(
            {
              error:
                eduInsertError.message ?? "Failed to save talent educations",
            },
            { status: 500 }
          );
        }
      }

      const { error: extrasUpsertError } = await db.from("talent_extras").upsert(
        {
          talent_id: user.id,
          content: {
            updated_at: now,
            talent_extras: structuredProfile.talentExtras,
          },
        },
        { onConflict: "talent_id" }
      );
      if (extrasUpsertError) {
        return NextResponse.json(
          {
            error: extrasUpsertError.message ?? "Failed to save talent extras",
          },
          { status: 500 }
        );
      }
    }

    const profile = await fetchTalentUserProfile({ admin, userId: user.id });
    const talentProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const resumeDownloadUrl = await getTalentResumeSignedUrl({
      admin,
      storagePath: profile?.resume_storage_path,
    });

    return NextResponse.json({
      ok: true,
      profile: {
        resumeFileName: profile?.resume_file_name ?? null,
        resumeStoragePath: profile?.resume_storage_path ?? null,
        resumeDownloadUrl,
        resumeLinks: profile?.resume_links ?? [],
      },
      talentProfile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
