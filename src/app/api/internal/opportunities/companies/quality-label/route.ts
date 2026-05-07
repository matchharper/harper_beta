import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { updateOpsCompanyHumanQualityLabel } from "@/lib/opsOpportunity";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => null)) as {
      humanQualityLabel?: unknown;
      workspaceId?: unknown;
    } | null;
    const rawLabel = body?.humanQualityLabel;

    const data = await updateOpsCompanyHumanQualityLabel({
      humanQualityLabel:
        rawLabel === null || rawLabel === undefined ? null : Number(rawLabel),
      workspaceId: String(body?.workspaceId ?? ""),
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to update human_quality_label"
    );
  }
}
