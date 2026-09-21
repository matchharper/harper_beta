import { NextRequest, NextResponse } from "next/server";
import {
  dispatchApprovedOutreach,
  verifyCronSecret,
  retryGtmReplyNotifications,
  syncGtmOutreachGmailHistory,
} from "@/lib/contentsEngine/outreach";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";

export const runtime = "nodejs";
export const maxDuration = 300;

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    await requireInternalApiUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      dispatchId?: unknown;
    };
    if (!isUuid(body.dispatchId)) {
      return NextResponse.json(
        { error: "A valid dispatchId is required" },
        { status: 400 }
      );
    }
    const results = await dispatchApprovedOutreach({
      dispatchId: body.dispatchId,
      limit: 1,
    });
    return NextResponse.json({
      ok: results.every((result) => result.ok),
      queued: results.length === 0,
      results,
    });
  } catch (error) {
    console.error("[contents-engine/outreach/dispatch]", error);
    return toInternalApiErrorResponse(error, "Failed to dispatch outreach");
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await dispatchApprovedOutreach({ limit: 20 });
    const recovery = await Promise.allSettled([syncGtmOutreachGmailHistory()]);
    // Notifications are retried from DB even when Gmail is unavailable.
    const notifications = await retryGtmReplyNotifications();
    return NextResponse.json({
      failed: results.filter((result) => !result.ok).length,
      ok:
        results.every((result) => result.ok) &&
        recovery.every((result) => result.status === "fulfilled") &&
        notifications.every((result) => result.ok),
      recovery: recovery.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : {
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : "Recovery failed",
            }
      ),
      notifications,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("[contents-engine/outreach/dispatch:recovery]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to recover outreach",
      },
      { status: 500 }
    );
  }
}
