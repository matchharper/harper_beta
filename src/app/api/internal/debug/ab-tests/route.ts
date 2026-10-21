import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsAbTests } from "@/lib/ops/abTestsServer";

import { OPS_AB_TESTS } from "@/lib/ops/abTests";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const experiment = OPS_AB_TESTS.find(
      (item) => item.key === req.nextUrl.searchParams.get("experiment")
    );
    if (!experiment) {
      return NextResponse.json(
        { error: "Unknown experiment" },
        { status: 400 }
      );
    }
    const payload = await fetchOpsAbTests({
      experiment: experiment.key,
      days: req.nextUrl.searchParams.get("days"),
      externalSurface: req.nextUrl.searchParams.get("externalSurface"),
      excludedEmails: req.nextUrl.searchParams.getAll("exclude"),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load A/B tests");
  }
}
