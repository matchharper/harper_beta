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
    const [profileResult, conversationResult, settingResult, documentResult] =
      await Promise.all([
        admin
          .from("talent_users")
          .select(
            "resume_file_name, resume_storage_path, resume_text, resume_links"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        admin
          .from("talent_conversations")
          .select("stage")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("talent_setting")
          .select("is_onboarding_done")
          .eq("user_id", user.id)
          .maybeSingle(),
        admin
          .from("talent_documents")
          .select("id", { count: "exact", head: true })
          .eq("talent_id", user.id)
          .eq("is_deleted", false),
      ]);

    const { data: profile, error } = profileResult;

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to load onboarding status" },
        { status: 500 }
      );
    }
    if (conversationResult.error) {
      return NextResponse.json(
        {
          error:
            conversationResult.error.message ??
            "Failed to load onboarding conversation status",
        },
        { status: 500 }
      );
    }
    if (settingResult.error) {
      return NextResponse.json(
        {
          error:
            settingResult.error.message ??
            "Failed to load onboarding setting status",
        },
        { status: 500 }
      );
    }
    if (documentResult.error) {
      return NextResponse.json(
        {
          error:
            documentResult.error.message ??
            "Failed to load onboarding documents",
        },
        { status: 500 }
      );
    }

    const hasFirstSubmission = Boolean(
      (documentResult.count ?? 0) > 0 ||
      normalizeText(profile?.resume_file_name) ||
      normalizeText(profile?.resume_storage_path) ||
      normalizeText(profile?.resume_text) ||
      hasResumeLink(profile?.resume_links)
    );
    const conversationStage = normalizeText(conversationResult.data?.stage);
    const isOnboardingDone = Boolean(settingResult.data?.is_onboarding_done);
    const needsOnboarding = !hasFirstSubmission && !isOnboardingDone;

    return NextResponse.json({
      ok: true,
      conversationStage: conversationStage || null,
      hasFirstSubmission,
      isOnboardingDone,
      needsOnboarding,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load onboarding status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
