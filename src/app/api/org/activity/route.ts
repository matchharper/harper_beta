import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { OrgHttpError } from "@/lib/org/httpError";
import { fetchOrgHomeActivityPage } from "@/lib/org/homeActivity.server";

const scope = z.object({
  workspaceId: z.string().uuid(),
  roleId: z.string().uuid().optional(),
  cursor: z.string().max(2048).optional(),
  search: z.string().trim().max(500).default(""),
  kind: z.enum(["all", "intros", "messages", "interviews"]).default("all"),
  locale: z.enum(["ko", "en"]).default("ko"),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = scope.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    if (!parsed.success) throw new OrgHttpError(400, "Invalid activity query");
    const page = await fetchOrgHomeActivityPage({ user, ...parsed.data });
    return NextResponse.json(page, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OrgHttpError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    if (error instanceof Error && error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[org/activity]", error);
    return NextResponse.json(
      { error: "피드를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
