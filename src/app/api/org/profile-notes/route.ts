import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfileEntityNotes } from "@/lib/org/profileNotes.server";
import { OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

export const maxDuration = 60;

const input = z.object({
  entities: z.array(
    z.object({
      kind: z.enum(["school", "company"]),
      name: z.string(),
    })
  ),
  locale: z.enum(["ko", "en"]),
  workspaceId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new OrgHttpError(400, "Invalid request");
    const notes = await getProfileEntityNotes({ ...parsed.data, user });
    return NextResponse.json({ notes, ok: true });
  } catch (error) {
    if (error instanceof OrgHttpError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[org/profile-notes]", error);
    return NextResponse.json(
      { error: "학교·회사 설명을 불러오지 못했어요." },
      { status: 500 }
    );
  }
}
