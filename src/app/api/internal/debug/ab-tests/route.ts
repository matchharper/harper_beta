import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsAbTests } from "@/lib/ops/abTestsServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchOpsAbTests({
      days: req.nextUrl.searchParams.get("days"),
      excludedEmails: req.nextUrl.searchParams.getAll("exclude"),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load A/B tests");
  }
}
