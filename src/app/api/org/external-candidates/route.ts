import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import {
  externalCandidatesForCompany,
  externalSourcingEnabledFor,
  type ExternalCandidatesResponse,
} from "@/lib/org/agent/externalSourcing";
import { listShownExternalCandidates } from "@/lib/org/agent/externalSourcing.server";
import { externalInviteSendingEnabled } from "@/lib/org/agent/externalInvite";

const scope = z.object({ workspaceId: z.string().uuid(), roleId: z.string().uuid() });

/** People outside Harper shown to the company for one Role. Off workspaces get an empty, disabled answer. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = scope.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) throw new OrgHttpError(400, "Invalid parameters");
    const { workspaceId, roleId } = parsed.data;
    const headers = { "Cache-Control": "private, no-store" };
    if (!externalSourcingEnabledFor(workspaceId)) {
      return NextResponse.json<ExternalCandidatesResponse>({ enabled: false, search: null, candidates: [] }, { headers });
    }
    const admin = getSupabaseAdmin();
    await assertOrgRoleAccess({ workspaceId, roleId, admin, user, permission: "view" });
    const { latestRun, candidates } = await listShownExternalCandidates({ admin, workspaceId, roleId });
    return NextResponse.json<ExternalCandidatesResponse>({
      enabled: true,
      inviteSending: externalInviteSendingEnabled(),
      search: latestRun
        ? { status: latestRun.status, startedAt: latestRun.created_at, finishedAt: latestRun.finished_at }
        : null,
      candidates: externalCandidatesForCompany(candidates),
    }, { headers });
  } catch (error) {
    if (error instanceof OrgHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[org/external-candidates]", error);
    return NextResponse.json({ error: "외부 후보를 불러오지 못했습니다." }, { status: 500 });
  }
}
