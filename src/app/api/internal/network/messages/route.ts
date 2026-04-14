import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchNetworkLeadMessagesPage,
  parseNetworkBeforeMessageId,
  parseNetworkMessageLimit,
} from "@/lib/opsNetworkServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const leadId = Number(req.nextUrl.searchParams.get("id") ?? "");
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const limit = parseNetworkMessageLimit(
      req.nextUrl.searchParams.get("limit")
    );
    const beforeMessageId = parseNetworkBeforeMessageId(
      req.nextUrl.searchParams.get("beforeMessageId")
    );

    const payload = await fetchNetworkLeadMessagesPage({
      leadId,
      beforeMessageId,
      limit,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load network candidate messages"
    );
  }
}
