import { NextRequest, NextResponse } from "next/server";
import { getFreshRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { syncVerifiedTalentAccountEmail } from "@/lib/talentOnboarding/accountEmail";

export async function POST(req: NextRequest) {
  try {
    const user = await getFreshRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await syncVerifiedTalentAccountEmail({
      admin: getTalentSupabaseAdmin(),
      user,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      status: result.pendingEmail ? "pending" : "complete",
    });
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;
    const message =
      error instanceof Error ? error.message : "Failed to sync account email";
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "EMAIL_SYNC_FAILED";
    return NextResponse.json(
      {
        code,
        error: message,
      },
      { status }
    );
  }
}
