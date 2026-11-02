import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  readTalentSchedules,
  writeTalentSchedule,
} from "@/lib/career/meetings/server";
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
  const roleId = req.nextUrl.searchParams.get("roleId") ?? undefined;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    (roleId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        roleId
      ))
  )
    return NextResponse.json(
      { error: "Invalid schedule filter" },
      { status: 400 }
    );
  try {
    const result = await readTalentSchedules({
      admin: getTalentSupabaseAdmin(),
      userId: user.id,
      roleId,
      from: new Date().toISOString(),
      offset,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Unable to read appointments" },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !body ||
    typeof body.requestId !== "string" ||
    !uuid.test(body.requestId) ||
    typeof body.roleId !== "string" ||
    !uuid.test(body.roleId) ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    typeof body.startsAt !== "string" ||
    !Number.isFinite(Date.parse(body.startsAt)) ||
    typeof body.timezone !== "string" ||
    (body.content !== undefined && typeof body.content !== "string") ||
    (body.endsAt != null &&
      (typeof body.endsAt !== "string" ||
        !Number.isFinite(Date.parse(body.endsAt)) ||
        Date.parse(body.endsAt) <= Date.parse(body.startsAt)))
  ) {
    return NextResponse.json({ error: "Invalid appointment" }, { status: 400 });
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: body.timezone });
  } catch {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }
  const admin = getTalentSupabaseAdmin();
  try {
    // Only attach a personal appointment to a position in this user's collection.
    const { data, error } = await admin
      .from("talent_effective_opportunity_recommendations_v1")
      .select("id")
      .eq("talent_id", user.id)
      .eq("role_id", body.roleId)
      .limit(1);
    if (error) throw error;
    if (!data?.length)
      return NextResponse.json(
        { error: "Position unavailable" },
        { status: 404 }
      );
    const schedule = await writeTalentSchedule({
      admin,
      userId: user.id,
      requestId: `manual:${body.requestId}`,
      input: {
        action: "create",
        source_key: `manual:${body.requestId}`,
        role_id: body.roleId,
        title: body.title.trim(),
        content: body.content ?? "",
        timezone: body.timezone,
        starts_at: body.startsAt,
        ends_at: body.endsAt ?? null,
      },
    });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Unable to save appointment" },
      { status: 503 }
    );
  }
}
