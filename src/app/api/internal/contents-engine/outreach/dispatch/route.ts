import { NextRequest, NextResponse } from "next/server";
import {
  dispatchApprovedOutreach,
  verifyCronSecret,
  verifyGtmOutreachWriteToken,
} from "@/lib/contentsEngine/outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
}

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
    const token = bearerToken(request);
    if (!token || !(await verifyGtmOutreachWriteToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to dispatch outreach",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await dispatchApprovedOutreach({ limit: 20 });
    return NextResponse.json({
      failed: results.filter((result) => !result.ok).length,
      ok: results.every((result) => result.ok),
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
