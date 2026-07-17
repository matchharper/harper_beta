import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { openOrgResume, OrgHttpError } from "@/lib/org/server";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/resume-access]", error);
  return NextResponse.json({ error: "Failed to open resume" }, { status: 500 });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      kind?: "storage" | "link" | null;
      link?: string | null;
      talentId?: string;
      workspaceId?: string;
    };
    const payload = await openOrgResume({
      kind: body.kind ?? null,
      link: body.link ?? null,
      talentId: body.talentId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
