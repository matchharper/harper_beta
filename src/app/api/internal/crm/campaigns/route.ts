import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsCrmCampaigns,
  saveOpsCrmCampaign,
} from "@/lib/ops/crmCampaignsServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(await fetchOpsCrmCampaigns());
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load CRM campaigns");
  }
}

async function saveCampaign(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const input = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return NextResponse.json(await saveOpsCrmCampaign({ input }));
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save CRM campaign");
  }
}

export async function POST(req: NextRequest) {
  return saveCampaign(req);
}

export async function PATCH(req: NextRequest) {
  return saveCampaign(req);
}
