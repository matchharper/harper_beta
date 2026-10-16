import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { OrgHttpError } from "@/lib/org/server";
import { enqueueCompanyUpdate } from "@/lib/org/agent/companyUpdate.server";

/** Explicit invocation only; no activation handler or scheduled caller. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => null);
    for (const key of ["workspaceId", "roleId", "channelDbId", "requestId"])
      if (typeof body?.[key] !== "string" || !body[key].trim() || body[key].length > 128)
        throw new OrgHttpError(400, `Invalid ${key}`);
    const result = await enqueueCompanyUpdate({ researchKickoff: {
      user, workspaceId: body.workspaceId, roleId: body.roleId,
      channelDbId: body.channelDbId, requestId: body.requestId,
    } });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof OrgHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[org/role-search-kickoff]", error);
    return NextResponse.json({ error: "서치 준비 요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
