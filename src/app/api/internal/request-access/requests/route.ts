import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  getRequestAccessBaseUrl,
  listRequestAccessReviewQueue,
} from "@/lib/requestAccess/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const payload = await listRequestAccessReviewQueue({
      baseUrl: getRequestAccessBaseUrl(req),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load request access review queue"
    );
  }
}
