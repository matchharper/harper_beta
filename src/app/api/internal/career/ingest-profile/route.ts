import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { ingestCareerTalentProfileFromRegisteredLinks } from "@/lib/opsCareerServer";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const body = (await req.json().catch(() => ({}))) as {
      source?: unknown;
      userId?: unknown;
    };
    const userId = String(body.userId ?? "").trim();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const result = await ingestCareerTalentProfileFromRegisteredLinks({
      source: body.source,
      userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to ingest talent profile");
  }
}
