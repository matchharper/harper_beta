import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsCrmBroadcastAudienceCount } from "@/lib/ops/crmBroadcastsServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const input = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return NextResponse.json(
      await fetchOpsCrmBroadcastAudienceCount({ input })
    );
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to count CRM broadcast audience"
    );
  }
}
