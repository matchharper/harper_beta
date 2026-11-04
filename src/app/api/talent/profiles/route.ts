import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  listProfiles,
  readProfileSnapshot,
  writeProfileSnapshot,
} from "@/lib/career/profiles/store";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getTalentSupabaseAdmin(),
    profileId = req.nextUrl.searchParams.get("profileId") ?? undefined;
  try {
    if (profileId) {
      const profile = await readProfileSnapshot({
        admin,
        userId: user.id,
        profileId,
        revision: req.nextUrl.searchParams.has("revision")
          ? Number(req.nextUrl.searchParams.get("revision"))
          : undefined,
      });
      const { data, error } = await (
        admin.from("talent_profile_revisions" as any) as any
      )
        .select("revision,created_at,source")
        .eq("profile_id", profileId)
        .order("revision", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ...profile, history: data ?? [] });
    }
    return NextResponse.json(
      await listProfiles({
        admin,
        userId: user.id,
        cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Profile unavailable" },
      { status: 400 }
    );
  }
}
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json(),
      operationId = req.headers.get("Idempotency-Key");
    if (!operationId) throw new Error("An operation identifier is required.");
    return NextResponse.json(
      await writeProfileSnapshot({
        admin: getTalentSupabaseAdmin(),
        userId: user.id,
        action: body.action,
        profileId: body.profileId,
        expectedRevision: body.expectedRevision,
        snapshot: body.snapshot,
        title: body.title,
        purpose: body.purpose,
        operationId: `profile-ui:${operationId}`,
        source: { kind: "profile_ui" },
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Profile could not be saved",
      },
      { status: 400 }
    );
  }
}
