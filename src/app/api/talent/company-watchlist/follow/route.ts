import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { updateTalentCompanyFollow } from "@/lib/career/companyWatchlist";

type Body = {
  action?: string;
  companyDbId?: number | string;
  companyWorkspaceId?: string | null;
  conversationId?: string | null;
  source?: string | null;
};

const parseCompanyDbId = (value: unknown) => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const companyDbId = parseCompanyDbId(body.companyDbId);
    if (!companyDbId) {
      return NextResponse.json(
        { error: "companyDbId is required" },
        { status: 400 }
      );
    }

    const action = body.action === "unfollow" ? "unfollow" : "follow";
    const result = await updateTalentCompanyFollow({
      action,
      admin: getTalentSupabaseAdmin(),
      companyDbId,
      companyWorkspaceId:
        typeof body.companyWorkspaceId === "string"
          ? body.companyWorkspaceId
          : null,
      conversationId:
        typeof body.conversationId === "string" ? body.conversationId : null,
      source: typeof body.source === "string" ? body.source : "watchlist",
      userId: user.id,
    });

    return NextResponse.json({
      ...result,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update follow",
      },
      { status: 500 }
    );
  }
}
