import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsCrmBroadcasts,
  saveOpsCrmBroadcast,
} from "@/lib/ops/crmBroadcastsServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(await fetchOpsCrmBroadcasts());
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load CRM broadcasts");
  }
}

async function saveBroadcast(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const input = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return NextResponse.json(await saveOpsCrmBroadcast({ input, user }));
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save CRM broadcast");
  }
}

export async function POST(req: NextRequest) {
  return saveBroadcast(req);
}

export async function PATCH(req: NextRequest) {
  return saveBroadcast(req);
}
