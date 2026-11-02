import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import { externalSourcingEnabledFor } from "@/lib/org/agent/externalSourcing";
import { passExternalCandidate } from "@/lib/org/agent/externalSourcing.server";

const body = z.object({
  workspaceId: z.string().uuid(), roleId: z.string().uuid(), candidateId: z.string().uuid(),
  reason: z.string().trim().max(500).default(""),
});

/** Role Inbox Pass for a person outside Harper. Contacts nobody; the person leaves the list. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new OrgHttpError(400, "Invalid parameters");
    const { workspaceId, roleId, candidateId, reason } = parsed.data;
    if (!externalSourcingEnabledFor(workspaceId)) throw new OrgHttpError(404, "Not available");
    const admin = getSupabaseAdmin();
    await assertOrgRoleAccess({ workspaceId, roleId, admin, user, permission: "manage_candidates" });
    const result = await passExternalCandidate({ admin, workspaceId, roleId, userId: user.id, candidateRef: candidateId, reason });
    if (result.status === "not_found") throw new OrgHttpError(404, "Candidate not found");
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    if (error instanceof OrgHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[org/external-candidates/pass]", error);
    return NextResponse.json({ error: "Pass 처리를 하지 못했습니다." }, { status: 500 });
  }
}
