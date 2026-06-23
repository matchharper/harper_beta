import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { runCareerCompanyRecommendations } from "@/lib/career/companyWatchlist";

type Body = {
  conversationId?: string | null;
  forceRefresh?: boolean | null;
  limit?: number | string | null;
  locale?: string | null;
  request?: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertConversationAccess(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await (
    args.admin.from("talent_conversations" as any) as any
  )
    .select("id")
    .eq("id", args.conversationId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read conversation");
  }
  if (!data) {
    throw new Error("Conversation not found");
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
    const rawConversationId =
      typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : null;
    const conversationId =
      rawConversationId && UUID_PATTERN.test(rawConversationId)
        ? rawConversationId
        : null;

    if (conversationId) {
      await assertConversationAccess({
        admin,
        conversationId,
        userId: user.id,
      });
    }

    const talentSetting = await fetchTalentSetting({ admin, userId: user.id });
    const result = await runCareerCompanyRecommendations({
      admin,
      conversationId,
      forceRefresh: body.forceRefresh === true,
      limit:
        typeof body.limit === "number"
          ? body.limit
          : Number.parseInt(String(body.limit ?? ""), 10),
      preferredLocale:
        talentSetting?.preferred_locale ??
        body.locale ??
        req.cookies.get("NEXT_LOCALE")?.value,
      request: typeof body.request === "string" ? body.request : null,
      source: "watchlist",
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
          error instanceof Error
            ? error.message
            : "Failed to generate company recommendations",
      },
      { status: 500 }
    );
  }
}
