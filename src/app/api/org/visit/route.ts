import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import { assertOrgWorkspaceAccess, OrgHttpError } from "@/lib/org/server";
import { isInternalEmail } from "@/lib/internalAccess";
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();
    if (
      typeof body.workspaceId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.workspaceId)
    )
      return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    const admin = getSupabaseAdmin();
    await assertOrgWorkspaceAccess({
      admin,
      user,
      workspaceId: body.workspaceId,
    });
    // Ops inspection is not customer engagement.
    if (!isInternalEmail(user.email)) {
      const { error } = await admin
        .from("logs")
        .insert({
          user_id: user.id,
          type: "org_workspace_visited",
          meta_data: { workspaceId: body.workspaceId },
        });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OrgHttpError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    if (error instanceof Error && error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[org/visit]", error);
    return NextResponse.json(
      { error: "Visit logging failed" },
      { status: 500 }
    );
  }
}
