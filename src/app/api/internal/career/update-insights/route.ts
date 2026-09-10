import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(
      {
        error:
          "Legacy insight editing is retired. Edit Search Brief or Memory through the unified context flow.",
      },
      { status: 410 }
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to authorize request");
  }
}
