import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { queueOpsCrmBroadcast } from "@/lib/ops/crmBroadcastsServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const input = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return NextResponse.json(
      await queueOpsCrmBroadcast({ broadcastId: input.broadcastId })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to queue CRM broadcast");
  }
}
