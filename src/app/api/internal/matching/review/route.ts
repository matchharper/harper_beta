import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsMatchingReviewBoard,
  parseOpsMatchingTags,
  setOpsMatchingReviewStage,
} from "@/lib/ops/matching";
import type { InternalConnectionConfirmationEmailMode } from "@/lib/ops/connectionConfirmationEmail";

export const runtime = "nodejs";

type ReviewStageBody = {
  emailMode?: unknown;
  roleId?: string;
  stage?: unknown;
  talentId?: string;
};

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const roleId = req.nextUrl.searchParams.get("roleId")?.trim() ?? "";
    if (!roleId) throw new InternalApiError(400, "roleId is required");

    const payload = await fetchOpsMatchingReviewBoard({
      recommendedFrom: req.nextUrl.searchParams.get("recommendedFrom"),
      recommendedTo: req.nextUrl.searchParams.get("recommendedTo"),
      roleId,
      tags: parseOpsMatchingTags(req.nextUrl.searchParams.get("tags")),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load Harper review board"
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as ReviewStageBody;
    const roleId = String(body.roleId ?? "").trim();
    const talentId = String(body.talentId ?? "").trim();
    if (!roleId) throw new InternalApiError(400, "roleId is required");
    if (!talentId) throw new InternalApiError(400, "talentId is required");
    if (typeof body.stage !== "string") {
      throw new InternalApiError(400, "stage is required");
    }
    const emailMode = String(body.emailMode ?? "schedule").trim();
    if (!["schedule", "send_now", "skip"].includes(emailMode)) {
      throw new InternalApiError(400, "emailMode is invalid");
    }

    const payload = await setOpsMatchingReviewStage({
      actorEmail: user.email ?? null,
      emailMode: emailMode as InternalConnectionConfirmationEmailMode,
      roleId,
      stage: body.stage,
      talentId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update review stage");
  }
}
