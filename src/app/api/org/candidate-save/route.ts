import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { OrgHttpError } from "@/lib/org/server";
import { setOrgCandidateSaved } from "@/lib/org/candidateSave.server";
import { z } from "zod";

const input = z.object({
  workspaceId: z.string().uuid(),
  roleId: z.string().uuid(),
  talentId: z.string().uuid(),
  recommendationId: z.string().min(1),
  saved: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      throw new OrgHttpError(400, "Invalid candidate bookmark");
    const args = parsed.data;
    const { savedAt } = await setOrgCandidateSaved({ ...args, user });
    return NextResponse.json(
      { ok: true, savedAt },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof OrgHttpError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    if (error instanceof Error && error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[org/candidate-save]", error);
    return NextResponse.json(
      { error: "후보자 저장 상태를 변경하지 못했습니다." },
      { status: 500 }
    );
  }
}
