import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchNetworkLeadDetail } from "@/lib/opsNetworkServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const leadId = Number(req.nextUrl.searchParams.get("id") ?? "");
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const detail = await fetchNetworkLeadDetail(leadId);
    return NextResponse.json(detail);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load candidate detail");
  }
}
