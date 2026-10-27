import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { OrgHttpError } from "@/lib/org/httpError";
import { readRoleMatchingBrief } from "@/lib/org/roleStart/matchingBrief.server";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const query = req.nextUrl.searchParams;
    const result = await readRoleMatchingBrief({
      admin: getSupabaseAdmin(),
      user,
      workspaceId: query.get("workspaceId") ?? "",
      roleId: query.get("roleId") ?? "",
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof OrgHttpError ? error.status
      : error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load matching criteria" }, { status });
  }
}
