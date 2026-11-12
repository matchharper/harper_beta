import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { listMatchings, matchingTable } from "@/lib/career/matching/store";
import { readExternalEvaluationResults } from "@/lib/career/matching/externalEvaluationResults";
import { fetchTalentPostingCardsByRoleIds } from "@/lib/talentOpportunity";
import type {
  CareerMatchingListPage,
  CareerMatchingResultsPage,
  CareerMatchingSummary,
} from "@/lib/career/matching/listTypes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = z
    .object({
      matchingId: z.string().uuid().optional(),
      runId: z.string().uuid().optional(),
      locale: z.enum(["ko", "en"]).optional(),
      cursor: z.string().uuid().optional(),
      excludeRecommended: z.enum(["true", "false"]).default("true"),
    })
    .safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!params.success) {
    return NextResponse.json(
      { error: "Invalid matching or cursor" },
      { status: 400 }
    );
  }
  const { matchingId, runId, cursor, excludeRecommended, locale } = params.data;
  if (runId && !matchingId)
    return NextResponse.json({ error: "matchingId is required with runId" }, { status: 400 });
  try {
    const admin = getTalentSupabaseAdmin();
    if (!matchingId) {
      const page = await listMatchings({
        admin,
        userId: user.id,
        archived: false,
        newestFirst: true,
        cursor,
      });
      return NextResponse.json({
        matchings: page.matchings.map(
          ({ id, title, description }: CareerMatchingSummary) => ({
            id,
            title,
            description,
          })
        ),
        nextCursor: page.nextCursor,
      } satisfies CareerMatchingListPage);
    }
    const { data, error } = await matchingTable(admin, "talent_matchings")
      .select("id, title")
      .eq("id", matchingId)
      .eq("talent_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json(
        { error: "Matching not found" },
        { status: 404 }
      );
    if (runId) {
      const { data: run, error: runError } = await matchingTable(admin, "external_recommendation_runs")
        .select("id")
        .eq("id", runId)
        .eq("matching_id", matchingId)
        .eq("talent_id", user.id)
        .eq("variant", "career_agent")
        .maybeSingle();
      if (runError) throw runError;
      if (!run) return NextResponse.json({ error: "Matching run not found" }, { status: 404 });
    }
    const page = await readExternalEvaluationResults({
      admin,
      userId: user.id,
      matchingId,
      ...(runId ? { runId } : {}),
      cursor,
      excludePreviouslyRecommended: excludeRecommended === "true",
      ...(process.env.NODE_ENV === "development" ? { includeRankingScore: true } : {}),
    });
    const postings = await fetchTalentPostingCardsByRoleIds({
      admin,
      userId: user.id,
      locale,
      roleIds: page.evaluations.map((evaluation) => evaluation.role_id),
    });
    const postingsByRoleId = new Map(
      postings.map((posting) => [posting.roleId, posting])
    );
    return NextResponse.json({
      matching: { id: matchingId, title: data.title ?? "" },
      opportunities: page.evaluations.map((evaluation) => {
        const posting = postingsByRoleId.get(evaluation.role_id);
        return {
          id: evaluation.id,
          isRecommended: evaluation.is_recommended,
          opportunity: posting ?? null,
          roleId: evaluation.role_id,
          title: posting?.title ?? evaluation.role?.name ?? null,
          companyName:
            posting?.companyName ??
            evaluation.role?.company_workspace?.company_name ??
            null,
          companyLogoUrl: posting?.companyLogoUrl ?? null,
          location: posting?.location ?? null,
          postedAt: posting?.postedAt ?? null,
          score: evaluation.assessment.fit?.mutualFit ?? null,
          ...(process.env.NODE_ENV === "development"
            ? { externalRankingScore: evaluation.ranking_score ?? null }
            : {}),
        };
      }),
      count: page.evaluationCount,
      nextCursor: page.evaluationCursor,
    } satisfies CareerMatchingResultsPage);
  } catch (error) {
    console.error("[career/matchings] Read failed", error);
    return NextResponse.json(
      { error: "Unable to load matchings" },
      { status: 500 }
    );
  }
}
