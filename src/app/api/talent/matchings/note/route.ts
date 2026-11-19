import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { matchingTable } from "@/lib/career/matching/store";
import type { CareerMatchingNote } from "@/lib/career/matching/listTypes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const matchingId = z
    .string()
    .uuid()
    .safeParse(req.nextUrl.searchParams.get("matchingId"));
  if (!matchingId.success)
    return NextResponse.json({ error: "Invalid matching" }, { status: 400 });

  try {
    const admin = getTalentSupabaseAdmin();
    const { data: matching, error } = await matchingTable(
      admin,
      "talent_matchings"
    )
      .select("id")
      .eq("id", matchingId.data)
      .eq("talent_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!matching)
      return NextResponse.json(
        { error: "Matching not found" },
        { status: 404 }
      );

    const page: {
      data: CareerMatchingNote["notes"] | null;
      error: { message: string } | null;
    } = await matchingTable(admin, "talent_notes")
      .select("id,kind,title,content,revision,created_at,updated_at")
      .eq("talent_id", user.id)
      .eq("matching_id", matchingId.data)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (page.error) throw new Error(page.error.message);
    const notes = page.data ?? [];
    return NextResponse.json({ notes } satisfies CareerMatchingNote, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[career/matchings/note] Read failed", error);
    return NextResponse.json(
      { error: "Unable to load matching note" },
      { status: 500 }
    );
  }
}
