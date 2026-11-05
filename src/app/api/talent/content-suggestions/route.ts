import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  listCareerContentSuggestions,
  reactToCareerContentSuggestion,
} from "@/lib/career/contentSuggestions.server";

const NO_STORE = { "Cache-Control": "private, no-store" };
const reactionSchema = z.object({
  id: z.string().uuid(),
  reaction: z.enum([
    "seen",
    "opened",
    "dismissed",
    "registered",
    "unregistered",
  ]),
});

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const items = await listCareerContentSuggestions({
      admin: getTalentSupabaseAdmin(),
      userId: user.id,
    });
    return NextResponse.json({ items }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "Unable to load suggestions" },
      { status: 503 }
    );
  }
}

/** The user's own reaction from Career home: seen, opened, dismissed, or
 * registered / unregistered for an event they signed up for. */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = reactionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const result = await reactToCareerContentSuggestion(
      { admin: getTalentSupabaseAdmin(), userId: user.id },
      parsed.data.id,
      parsed.data.reaction
    );
    if (result.status === "not_found")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { status: result.status, item: result.item },
      { headers: NO_STORE }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to save reaction" },
      { status: 503 }
    );
  }
}
