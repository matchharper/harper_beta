import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  closeCareerActionItem,
  listCareerActionItems,
} from "@/lib/career/actionItems.server";

const closeSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  conversationId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const items = await listCareerActionItems({
      admin: getTalentSupabaseAdmin(),
      userId: user.id,
    });
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load visible actions" },
      { status: 503 }
    );
  }
}

/** The user closes one follow-up. An item already gone counts as closed. */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = closeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const result = await closeCareerActionItem({
      admin: getTalentSupabaseAdmin(),
      userId: user.id,
      ...parsed.data,
    });
    if (result.status === "conflict")
      return NextResponse.json({ error: "Changed" }, { status: 409 });
    return NextResponse.json(
      { status: result.status },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to close visible action" },
      { status: 503 }
    );
  }
}
