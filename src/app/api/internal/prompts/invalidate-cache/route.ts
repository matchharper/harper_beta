import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { invalidateCache } from "@/lib/talentOnboarding/prompts/promptCache";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    invalidateCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to invalidate cache");
  }
}
