import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { OrgHttpError, updateOrgWorkspace } from "@/lib/org/server";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/workspace]", error);
  return NextResponse.json({ error: "Failed to update workspace" }, { status: 500 });
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      companyDescription?: string | null;
      pitch?: string | null;
      request?: string | null;
      workspaceId?: string;
    };
    const payload = await updateOrgWorkspace({
      companyDescription: body.companyDescription ?? null,
      pitch: body.pitch ?? null,
      request: body.request ?? null,
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
