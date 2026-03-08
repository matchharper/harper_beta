import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  fetchTalentUserProfile,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

type Body = {
  resumeFileName?: string;
  resumeStoragePath?: string;
  resumeText?: string;
  links?: string[];
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

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
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

    const profile = await fetchTalentUserProfile({ admin, userId: user.id });
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
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
