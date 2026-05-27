import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchManualInternalRecommendationRoles,
  queueManualInternalRecommendationRun,
} from "@/lib/opsCareerServer";

export const runtime = "nodejs";

type PostBody = {
  reason?: string | null;
  roleId?: string;
  userId?: string;
};

function parseLimit(value: string | null) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchManualInternalRecommendationRoles({
      limit: parseLimit(req.nextUrl.searchParams.get("limit")),
      query: req.nextUrl.searchParams.get("query"),
      userId: req.nextUrl.searchParams.get("userId"),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load manual internal recommendation roles"
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const userId = String(body.userId ?? "").trim();
    const roleId = String(body.roleId ?? "").trim();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }
    if (!roleId) {
      return NextResponse.json(
        { error: "roleId is required" },
        { status: 400 }
      );
    }
    if (
      body.reason !== null &&
      body.reason !== undefined &&
      typeof body.reason !== "string"
    ) {
      return NextResponse.json(
        { error: "reason must be a string or null" },
        { status: 400 }
      );
    }

    const payload = await queueManualInternalRecommendationRun({
      reason: body.reason ?? null,
      requestedBy: user.email ?? user.id,
      roleId,
      userId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to queue manual internal recommendation"
    );
  }
}
