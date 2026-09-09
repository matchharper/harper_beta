import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";

export const runtime = "nodejs";

/**
 * Retired with unified Career Memory. Onboarding keeps its existing extraction
 * pass, while ordinary conversations write Brief/Memory through the common
 * agent tool. Re-running a second model over historical chat would create a
 * competing writer and can silently change the user's current criteria.
 */
export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(
      {
        error:
          "Insight refresh is retired. Use the original conversation agent or edit Search Brief and Memory directly.",
      },
      { status: 410 }
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to authorize request");
  }
}
