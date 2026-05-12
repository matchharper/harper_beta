import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const hasResumeLink = (value: unknown) =>
  Array.isArray(value) &&
  value.some((entry) => normalizeText(entry).length > 0);

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const { data: profile, error } = await admin
      .from("talent_users")
      .select("resume_file_name, resume_storage_path, resume_text, resume_links")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to load onboarding status" },
        { status: 500 }
      );
    }

    const hasFirstSubmission = Boolean(
      normalizeText(profile?.resume_file_name) ||
        normalizeText(profile?.resume_storage_path) ||
        normalizeText(profile?.resume_text) ||
        hasResumeLink(profile?.resume_links)
    );

    return NextResponse.json({
      ok: true,
      hasFirstSubmission,
      needsOnboarding: !hasFirstSubmission,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load onboarding status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
