import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { readActivityRecord } from "@/lib/career/simulation/activityStore";
import { applicationReviewView } from "@/lib/career/simulation/applicationReviewView";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getTalentSupabaseAdmin();
  const messageId = req.nextUrl.searchParams.get("messageId"),
    roleId = req.nextUrl.searchParams.get("roleId"),
    jobSlug = req.nextUrl.searchParams.get("jobSlug");
  if (!messageId && !roleId && !jobSlug)
    return NextResponse.json(
      { error: "Application required" },
      { status: 400 }
    );
  let query = admin
    .from("talent_simulate_application")
    .select("*")
    .eq("user_id", user.id);
  if (messageId) {
    const id = Number(messageId);
    if (!Number.isSafeInteger(id) || id <= 0)
      return NextResponse.json(
        { error: "Invalid application" },
        { status: 400 }
      );
    query = query.eq("message_id", id);
  } else if (roleId) {
    if (!z.string().uuid().safeParse(roleId).success)
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    query = query.or(
      `role_ref.eq.role:${roleId},payload->activity->>roleId.eq.${roleId}`
    );
  } else query = query.eq("role_ref", `job:${jobSlug}`);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error)
    return NextResponse.json(
      { error: "Application unavailable" },
      { status: 503 }
    );
  const records = await Promise.all((data ?? [])
    .map(async (row) => {
      const store = {
        admin,
        userId: user.id,
        conversationId: row.conversation_id,
      };
      const record = await readActivityRecord(row, store);
      return applicationReviewView(record);
    }));
  return NextResponse.json({ applications: records }, { headers });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "This saved application is read-only. Continue in chat." }, { status: 410 });
}
