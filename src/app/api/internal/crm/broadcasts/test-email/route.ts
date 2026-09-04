import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendOpsCrmBroadcastTestEmail } from "@/lib/ops/crmBroadcastsServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const input = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return NextResponse.json(
      await sendOpsCrmBroadcastTestEmail({ input, user })
    );
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to send CRM broadcast test email"
    );
  }
}
