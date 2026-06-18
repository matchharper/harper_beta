import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { updateOpsMatchingFitHumanLabel } from "@/lib/ops/matching";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => null)) as {
      fitId?: unknown;
      humanLabel?: unknown;
      humanReason?: unknown;
    } | null;

    const payload = await updateOpsMatchingFitHumanLabel({
      fitId: String(body?.fitId ?? ""),
      humanLabel: body?.humanLabel ?? null,
      humanReason: body?.humanReason,
      reviewerEmail: user.email ?? null,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update human label");
  }
}
