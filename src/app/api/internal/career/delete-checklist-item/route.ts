import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  getTalentSupabaseAdmin,
  deleteCustomChecklistItem,
} from "@/lib/talentOnboarding/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const body = await req.json();
    const { key } = body as { key?: unknown };

    if (typeof key !== "string" || !key.trim()) {
      return NextResponse.json(
        { error: "key is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    await deleteCustomChecklistItem({ admin, key: key.trim() });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to delete checklist item");
  }
}
