import { NextRequest, NextResponse } from "next/server";
import {
  applyDetailRevealState,
  fetchCandidateMarkMapForUser,
  fetchRevealMapForUser,
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const candidId = String(searchParams.get("candidId") ?? "").trim();

    if (!candidId) {
      return NextResponse.json(
        { error: "candidId required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await ((supabaseAdmin.from("candid" as any) as any)
      .select(
        `
          *,
          edu_user (
            candid_id,
            school,
            degree,
            description,
            field,
            start_date,
            end_date,
            url
          ),
          experience_user (
            candid_id,
            role,
            start_date,
            end_date,
            description,
            months,
            company_id,
            company_db (
              name,
              logo,
              linkedin_url,
              founded_year,
              employee_count_range,
              specialities,
              investors,
              short_description,
              location
            )
          ),
          publications (
            title,
            link,
            published_at,
            citation_num
          ),
          extra_experience(
            *
          ),
          connection (
            user_id,
            typed
          ),
          s:summary ( text )
        `
      )
      .eq("id", candidId)
      .maybeSingle());

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    const [
      revealMap,
      candidateMarkMap,
      connectionRows,
      autoRows,
      scholarProfileRow,
      githubProfiles,
    ] = await Promise.all([
      fetchRevealMapForUser(supabaseAdmin, user.id, [candidId]),
      fetchCandidateMarkMapForUser(supabaseAdmin, user.id, [candidId]),
      ((supabaseAdmin.from("connection" as any) as any)
        .select("user_id, typed")
        .eq("user_id", user.id)
        .eq("candid_id", candidId)),
      ((supabaseAdmin.from("automation_results" as any) as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("candid_id", candidId)
        .limit(1)),
      ((supabaseAdmin.from("scholar_profile" as any) as any)
        .select("*")
        .eq("candid_id", candidId)
        .maybeSingle()),
      ((supabaseAdmin.from("github_profile" as any) as any)
        .select("*")
        .eq("candid_id", candidId)),
    ]);

    if (connectionRows.error) throw connectionRows.error;
    if (autoRows.error) throw autoRows.error;
    if (scholarProfileRow.error) throw scholarProfileRow.error;
    if (githubProfiles.error) throw githubProfiles.error;

    let scholarPapers: any[] = [];
    const scholarProfile = scholarProfileRow.data ?? null;
    if (scholarProfile?.id) {
      const { data: contributions, error: contributionsError } = await (
        (supabaseAdmin.from("scholar_contributions" as any) as any)
      )
        .select("paper_id")
        .eq("scholar_profile_id", scholarProfile.id);

      if (contributionsError) throw contributionsError;

      const paperIds = Array.from(
        new Set(
          (contributions ?? [])
            .map((row: any) => String(row?.paper_id ?? "").trim())
            .filter(Boolean)
        )
      );

      if (paperIds.length > 0) {
        const { data: papers, error: papersError } = await (
          (supabaseAdmin.from("papers" as any) as any)
        )
          .select("*")
          .in("id", paperIds)
          .order("total_citations", { ascending: false })
          .order("pub_year", { ascending: false, nullsFirst: false });

        if (papersError) throw papersError;
        scholarPapers = papers ?? [];
      }
    }

    let githubRepoContributions: any[] = [];
    const githubProfileRows = (githubProfiles.data ?? []) as any[];
    const githubProfile = githubProfileRows
      .slice()
      .sort((a: any, b: any) => {
        const aHasReadme = typeof a?.readme_markdown === "string" && a.readme_markdown.trim() ? 1 : 0;
        const bHasReadme = typeof b?.readme_markdown === "string" && b.readme_markdown.trim() ? 1 : 0;
        if (aHasReadme !== bHasReadme) return bHasReadme - aHasReadme;
        return Number(b?.followers ?? 0) - Number(a?.followers ?? 0);
      })[0] ?? null;

    const githubProfileIds = githubProfileRows
      .map((row: any) => String(row?.id ?? "").trim())
      .filter(Boolean);

    if (githubProfileIds.length > 0) {
      const { data: contributionRows, error: contributionError } = await (
        (supabaseAdmin.from("github_repo_contribution" as any) as any)
      )
        .select("*")
        .in("github_profile_id", githubProfileIds);

      if (contributionError) throw contributionError;

      const repoIds = Array.from(
        new Set(
          (contributionRows ?? [])
            .map((row: any) => String(row?.repo_id ?? "").trim())
            .filter(Boolean)
        )
      );

      const { data: repoRows, error: repoError } =
        repoIds.length > 0
          ? await ((supabaseAdmin.from("github_repo" as any) as any)
              .select("*")
              .in("id", repoIds))
          : { data: [], error: null };

      if (repoError) throw repoError;

      const repoById = new Map((repoRows ?? []).map((row: any) => [row.id, row]));
      githubRepoContributions = (contributionRows ?? []).map((row: any) => ({
        ...row,
        github_repo: repoById.get(row.repo_id ?? "") ?? null,
      }));
    }

    const payload = {
      ...data,
      connection: connectionRows.data ?? [],
      candidate_mark: candidateMarkMap.get(candidId) ?? null,
      scholar_profile: scholarProfile,
      github_profile: githubProfile,
      scholar_papers: scholarPapers,
      github_repo_contribution: githubRepoContributions,
      isAutomationResult: (autoRows.data ?? []).length > 0,
    };

    return NextResponse.json(
      applyDetailRevealState(payload, revealMap.get(candidId) === true)
    );
  } catch (error: any) {
    const message = String(error?.message ?? "Unknown error");
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
