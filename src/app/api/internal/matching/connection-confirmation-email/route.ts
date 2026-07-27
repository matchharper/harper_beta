import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  ConnectionConfirmationEmailError,
  updateInternalConnectionConfirmationEmail,
} from "@/lib/ops/connectionConfirmationEmail";

export const runtime = "nodejs";

type ActionBody = {
  action?: unknown;
  queueId?: unknown;
  talentId?: unknown;
};

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as ActionBody;
    const action = String(body.action ?? "").trim();
    const queueId = String(body.queueId ?? "").trim();
    const talentId = String(body.talentId ?? "").trim();

    if (action !== "cancel" && action !== "send_now") {
      throw new InternalApiError(400, "action must be cancel or send_now");
    }
    if (!queueId) throw new InternalApiError(400, "queueId is required");
    if (!talentId) throw new InternalApiError(400, "talentId is required");

    const payload = await updateInternalConnectionConfirmationEmail({
      action,
      actorEmail: user.email ?? null,
      queueId,
      talentId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ConnectionConfirmationEmailError) {
      return toInternalApiErrorResponse(
        new InternalApiError(error.status, error.message),
        "Failed to update connection confirmation email"
      );
    }
    return toInternalApiErrorResponse(
      error,
      "Failed to update connection confirmation email"
    );
  }
}
