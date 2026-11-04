import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";

// Compatibility for an already-open old Career client. Following is persisted by
// the follow endpoint; its shared delta collector owns any useful future turn.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ assistantMessage: null, ok: true });
}
