import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  parseApplicationSimulation,
  SIMULATION_MESSAGE_TYPE,
} from "@/lib/career/simulation/types";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("messageId") ?? "";
  if (!/^\d+$/.test(id))
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const { data, error } = await getTalentSupabaseAdmin()
    .from("talent_messages")
    .select("payload")
    .eq("id", Number(id))
    .eq("user_id", user.id)
    .eq("message_type", SIMULATION_MESSAGE_TYPE)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Unable to load analysis" },
      { status: 500 }
    );
  const simulation = parseApplicationSimulation(data?.payload);
  if (!simulation)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    { simulation },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
