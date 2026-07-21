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
      description?: string | null;
      employmentTypes?: string[] | null;
      externalJdUrl?: string | null;
      isExpired?: boolean | null;
      locationText?: string | null;
      name?: string | null;
      request?: string | null;
      roleId?: string;
      status?: string | null;
      workMode?: string | null;
      workspaceId?: string;
    };
    const payload = await updateOrgRole({
      description: body.description ?? null,
      employmentTypes: body.employmentTypes ?? null,
      externalJdUrl: body.externalJdUrl ?? null,
      isExpired: body.isExpired ?? null,
      locationText: body.locationText ?? null,
      name: body.name ?? null,
      request: body.request ?? null,
      roleId: body.roleId ?? "",
      status: body.status ?? null,
      user,
      workMode: body.workMode ?? null,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
