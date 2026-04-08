import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { insertTalentNotification } from "@/lib/opsNetworkServer";

export const runtime = "nodejs";

type Body = {
  id?: number;
  message?: string;
};

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const leadId = Number(body.id ?? "");
    const message = String(body.message ?? "").trim();

    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json(
        { error: "Notification message is required" },
        { status: 400 }
      );
    }

    const notification = await insertTalentNotification({
      leadId,
      message,
    });

    return NextResponse.json({ notification, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to save candidate notification"
    );
  }
}
