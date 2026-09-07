import { after, NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentContexts,
  fetchTalentContextsUpdatedAt,
  getTalentSupabaseAdmin,
  mutateTalentContexts,
  refreshTalentContextEmbeddings,
  toTalentContextResponse,
  type TalentContextDirectChange,
} from "@/lib/talentOnboarding/server";

const briefPayload = async (userId: string) => {
  const admin = getTalentSupabaseAdmin();
  const [brief, talentContextsUpdatedAt] = await Promise.all([
    fetchTalentContexts({
      admin,
      collection: "brief",
      limit: 500,
      userId,
    }),
    fetchTalentContextsUpdatedAt({ admin, userId }),
  ]);
  return {
    talentBrief: brief.map(toTalentContextResponse),
    talentContextsUpdatedAt,
  };
};

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const collection =
      req.nextUrl.searchParams.get("collection") === "brief"
        ? "brief"
        : "memory";
    if (collection === "brief") {
      return NextResponse.json(await briefPayload(user.id));
    }

    const parsedLimit = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isSafeInteger(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 50;
    const parsedCursor = Number(req.nextUrl.searchParams.get("cursor"));
    const beforeId =
      Number.isSafeInteger(parsedCursor) && parsedCursor > 0
        ? parsedCursor
        : null;
    const admin = getTalentSupabaseAdmin();
    const rows = await fetchTalentContexts({
      admin,
      beforeId,
      collection: "memory",
      limit: limit + 1,
      order: "id",
      userId: user.id,
    });
    const page = rows.slice(0, limit);
    return NextResponse.json({
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      talentMemories: page.map(toTalentContextResponse),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load saved career context",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      changes?: TalentContextDirectChange[];
      requestId?: string;
    };
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (
      changes.some(
        (change) =>
          change &&
          typeof change === "object" &&
          Object.prototype.hasOwnProperty.call(change, "key")
      )
    ) {
      return NextResponse.json(
        { error: "Compatibility keys cannot be edited directly" },
        { status: 400 }
      );
    }
    const admin = getTalentSupabaseAdmin();
    const mutation = await mutateTalentContexts({
      admin,
      changes,
      requestId: body.requestId,
      sourceRefs: [{ type: "user_profile_ui" }],
      userId: user.id,
    });
    after(async () => {
      await refreshTalentContextEmbeddings({
        admin,
        ids: mutation.applied.map((row) => row.id),
        userId: user.id,
      }).catch((error) => {
        console.error("[talent-contexts] UI embedding refresh failed", error);
      });
    });
    return NextResponse.json({
      applied: mutation.applied.map(toTalentContextResponse),
      ok: true,
      ...(await briefPayload(user.id)),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update saved career context";
    const status = /conflict|revision|unavailable|not found/i.test(message)
      ? 409
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
