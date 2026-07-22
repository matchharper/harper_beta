import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsCrmCampaignStats } from "@/lib/ops/crmCampaignsServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(
      await fetchOpsCrmCampaignStats({
        campaignId: req.nextUrl.searchParams.get("campaignId"),
      })
    );
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load CRM campaign stats"
    );
  }
}
