import { NextRequest, NextResponse } from "next/server";
import {
  fetchRevealMapForUser,
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const paperId = String(searchParams.get("paperId") ?? "").trim();

    if (!paperId) {
      return NextResponse.json(
        { error: "paperId required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: paper, error: paperError } = await supabaseAdmin
      .from("papers")
      .select("*")
      .eq("id", paperId)
      .maybeSingle();

    if (paperError) throw paperError;
    if (!paper) {
      return NextResponse.json(null);
    }

    const { data: contributions, error: contributionsError } =
      await supabaseAdmin
        .from("scholar_contributions")
        .select("*")
        .eq("paper_id", paperId)
        .order("author_order", { ascending: true, nullsFirst: false });

    if (contributionsError) throw contributionsError;

    const scholarProfileIds = Array.from(
      new Set(
        (contributions ?? [])
          .map((row) => String(row.scholar_profile_id ?? "").trim())
          .filter(Boolean)
      )
    );

    let scholarProfiles: any[] = [];
    if (scholarProfileIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabaseAdmin
        .from("scholar_profile")
        .select("*")
        .in("id", scholarProfileIds);

      if (profileError) throw profileError;
      scholarProfiles = profileRows ?? [];
    }

    const candidateIds = Array.from(
      new Set(
        scholarProfiles
          .map((row) => String(row?.candid_id ?? "").trim())
          .filter(Boolean)
      )
    );
    const revealMap = await fetchRevealMapForUser(
      supabaseAdmin,
      user.id,
      candidateIds
    );

    const profileById = new Map(
      scholarProfiles.map((profile) => [String(profile.id), profile] as const)
    );

    const resolvedContributors = (contributions ?? []).map((contribution) => {
      const scholarProfile =
        profileById.get(String(contribution.scholar_profile_id ?? "").trim()) ??
        null;
      const candidId = String(scholarProfile?.candid_id ?? "").trim();

      return {
        ...contribution,
        scholar_profile: scholarProfile,
        profile_revealed: !candidId || revealMap.get(candidId) === true,
      };
    });

    return NextResponse.json({
      paper,
      contributors: resolvedContributors,
    });
  } catch (error: any) {
    const message = String(error?.message ?? "Unknown error");
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
