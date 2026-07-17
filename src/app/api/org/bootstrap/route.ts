import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { fetchOrgBootstrap, OrgHttpError } from "@/lib/org/server";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/bootstrap]", error);
  return NextResponse.json({ error: "Failed to load organization" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const orgId = req.nextUrl.searchParams.get("orgId");
    const payload = await fetchOrgBootstrap({ orgId, user });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
