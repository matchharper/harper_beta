import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { OrgHttpError, updateOrgRole } from "@/lib/org/server";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/role]", error);
  return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      criteria?: unknown;
      description?: string | null;
      employmentTypes?: string[] | null;
      externalJdUrl?: string | null;
      expectedCriteria?: unknown;
      isExpired?: boolean | null;
      locationText?: string | null;
      name?: string | null;
      request?: string | null;
      roleId?: string;
      salaryRange?: string | null;
      status?: string | null;
      workMode?: string | null;
      workspaceId?: string;
    };
    const payload = await updateOrgRole({
      criteria: body.criteria,
      description: body.description,
      employmentTypes: body.employmentTypes,
      externalJdUrl: body.externalJdUrl,
      expectedCriteria: body.expectedCriteria,
      isExpired: body.isExpired,
      locationText: body.locationText,
      name: body.name,
      request: body.request,
      roleId: body.roleId ?? "",
      salaryRange: body.salaryRange,
      status: body.status,
      user,
      workMode: body.workMode,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
