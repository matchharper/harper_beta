import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFreshRequestUser } from "@/lib/supabaseServer";
import { canInspectCareerAgentMessages } from "@/lib/internalAccess";
import { agentContactDatabase } from "@/lib/agentContacts/store";
import { readAdminAgentHistory } from "@/lib/agentContacts/adminHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const params = z.object({
  roleId: z.string().uuid(),
  offset: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
});

export async function GET(req: NextRequest) {
  try {
    // Never use the development-only unverified JWT fallback for this inspector.
    const user = await getFreshRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canInspectCareerAgentMessages(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const input = params.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!input.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const result = await readAdminAgentHistory(
      agentContactDatabase().query, user.id, input.data.roleId, input.data.offset
    );
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[CareerAgentMessages]", error);
    return NextResponse.json({ error: "Unable to load agent messages" }, { status: 500 });
  }
}
