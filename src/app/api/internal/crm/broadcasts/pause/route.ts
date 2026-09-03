import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { setOpsCrmBroadcastPaused } from "@/lib/ops/crmBroadcastsServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const input = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return NextResponse.json(
      await setOpsCrmBroadcastPaused({
        broadcastId: input.broadcastId,
        paused: input.paused,
      })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update CRM broadcast");
  }
}
