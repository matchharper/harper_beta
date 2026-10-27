import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import { withRecommendationRank } from "@/lib/org/candidateBoardSort";
import {
  fetchBoardProfileLabels,
  fetchOrgBoard,
  OrgHttpError,
} from "@/lib/org/server";
import { readOrgCandidateSaves } from "@/lib/org/candidateSaved.server";
import { getOrgInboxCounts, paginateOrgInbox } from "@/lib/org/inboxPagination";
import { readOrgCandidateDetail } from "@/lib/org/candidatePreview.server";
import { withOrgRequestScope } from "@/lib/org/requestScope.server";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/board]", error);
  return NextResponse.json(
    { error: "Failed to load candidates" },
    { status: 500 }
  );
}

export function GET(req: NextRequest) {
  return withOrgRequestScope(() => readBoard(req));
}

async function readBoard(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const stage = req.nextUrl.searchParams.get("inboxStage");
    const countsOnly = req.nextUrl.searchParams.get("inboxCounts") === "true";
    const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
    if (
      stage !== null &&
      !["pending_connection", "company_intro", "saved"].includes(stage)
    ) {
      throw new OrgHttpError(400, "Invalid inbox stage");
    }
    if (
      stage &&
      (!Number.isSafeInteger(offset) ||
        offset < 0 ||
        !req.nextUrl.searchParams.get("roleId"))
    ) {
      throw new OrgHttpError(400, "A role and a valid offset are required");
    }
    const payload = await fetchOrgBoard({
      includeProfileLabels: false,
      query: req.nextUrl.searchParams.get("query"),
      recommendedDate: req.nextUrl.searchParams.get("recommendedDate"),
      recommendedFromDate: req.nextUrl.searchParams.get("recommendedFromDate"),
      recommendedToDate: req.nextUrl.searchParams.get("recommendedToDate"),
      roleId: req.nextUrl.searchParams.get("roleId"),
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    const board = {
      ...payload,
      items: withRecommendationRank(
        await readOrgCandidateSaves(
          getSupabaseAdmin(),
          payload.workspaceId,
          payload.items
        )
      ),
    };
    if (countsOnly) {
      return NextResponse.json(
        {
          ...board,
          items: [],
          counts: getOrgInboxCounts(board.items),
          nextOffset: null,
        },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }
    if (
      stage === "pending_connection" ||
      stage === "company_intro" ||
      stage === "saved"
    ) {
      const page = paginateOrgInbox(
        board,
        stage,
        req.nextUrl.searchParams.get("sort") === "recommended"
          ? "recommended"
          : "latest",
        offset
      );
      // A page is ready only after all ten review bodies are ready. Reuse the
      // detail endpoint's permission/sharing checks; reads never acknowledge views.
      const [labels, details] = await Promise.all([
        fetchBoardProfileLabels({
          admin: getSupabaseAdmin(),
          talentIds: page.items.map((item) => item.talentId),
        }),
        Promise.all(
          page.items.map(
            async (item) =>
              [
                item.recommendationId,
                await readOrgCandidateDetail({
                  recommendationId: item.recommendationId,
                  roleId: item.roleId,
                  talentId: item.talentId,
                  workspaceId: page.workspaceId,
                  user,
                }),
              ] as const
          )
        ),
      ]);
      page.details = Object.fromEntries(details);
      page.items = page.items.map((item) => ({
        ...item,
        talent: {
          ...item.talent,
          recentCompanies: labels.recentCompanies.get(item.talentId) ?? [],
          recentSchools: labels.recentSchools.get(item.talentId) ?? [],
        },
      }));
      return NextResponse.json(page, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json(board, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
