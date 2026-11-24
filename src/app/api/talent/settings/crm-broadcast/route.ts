import { NextRequest, NextResponse } from "next/server";
import {
  fetchCrmBroadcastSubscribed,
  setCrmBroadcastSubscribed,
} from "@/lib/career/crmBroadcastSubscription.server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

/** Account settings toggle for Harper's group emails (/ops/crm broadcasts). */
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const subscribed = await fetchCrmBroadcastSubscribed({
      admin: getTalentSupabaseAdmin(),
      userId: user.id,
    });
    return NextResponse.json({ ok: true, subscribed });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load email setting";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      subscribed?: unknown;
    };
    if (typeof body.subscribed !== "boolean") {
      return NextResponse.json(
        { error: "subscribed must be a boolean" },
        { status: 400 }
      );
    }
    const found = await setCrmBroadcastSubscribed({
      admin: getTalentSupabaseAdmin(),
      subscribed: body.subscribed,
      userId: user.id,
    });
    if (!found) {
      return NextResponse.json(
        { error: "Settings not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, subscribed: body.subscribed });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save email setting";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
