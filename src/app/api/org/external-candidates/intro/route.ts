import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import { externalSourcingEnabledFor } from "@/lib/org/agent/externalSourcing";
import { loadShownExternalCandidate, requestExternalIntro } from "@/lib/org/agent/externalSourcing.server";

const body = z.object({
  workspaceId: z.string().uuid(), roleId: z.string().uuid(), candidateId: z.string().uuid(),
  companyAppeal: z.string().trim().min(1).max(2_000),
  introRecipientEmails: z.array(z.string().trim().toLowerCase().email()).min(1).max(10),
});

/**
 * Role page Send Intro for a person outside Harper: the same inputs as a member Intro request.
 * Only for a person with a found address. Records the request; with invitations on, Harper emails one invitation.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new OrgHttpError(400, "Invalid parameters");
    const { workspaceId, roleId, candidateId, companyAppeal, introRecipientEmails } = parsed.data;
    if (!externalSourcingEnabledFor(workspaceId)) throw new OrgHttpError(404, "Not available");
    const admin = getSupabaseAdmin();
    await assertOrgRoleAccess({ workspaceId, roleId, admin, user, permission: "manage_candidates" });
    const candidate = await loadShownExternalCandidate({ admin, workspaceId, roleId, candidateRef: candidateId });
    if (!candidate) throw new OrgHttpError(404, "Candidate not found");
    // The inbox offers Send Intro only once an address is found (Harper's tool may still queue a lookup).
    if (candidate.contact?.status !== "found") throw new OrgHttpError(409, "No email address was found for this person.");
    const result = await requestExternalIntro({ admin, workspaceId, roleId, userId: user.id, candidate, companyAppeal,
      introRecipientEmails: [...new Set(introRecipientEmails)] });
    if (result.status === "no_email") throw new OrgHttpError(409, "No email address was found for this person.");
    if (result.status === "role_not_active") throw new OrgHttpError(409, "진행 중인 역할에서만 연결을 요청할 수 있어요.");
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    if (error instanceof OrgHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[org/external-candidates/intro]", error);
    return NextResponse.json({ error: "연결 요청을 하지 못했습니다." }, { status: 500 });
  }
}
