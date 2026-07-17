import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  createOpsMatchingProgress,
  deleteOpsMatchingProgress,
  fetchOpsMatchingProgress,
} from "@/lib/ops/matching";

export const runtime = "nodejs";

type ProgressBody = {
  progressId?: string;
  roleId?: string;
  talentId?: string;
  text?: unknown;
};

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const talentId = req.nextUrl.searchParams.get("talentId")?.trim() ?? "";
    if (!talentId) throw new InternalApiError(400, "talentId is required");

    const payload = await fetchOpsMatchingProgress({
      roleId: req.nextUrl.searchParams.get("roleId"),
      talentId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load talent progress");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as ProgressBody;
    const roleId = String(body.roleId ?? "").trim();
    const talentId = String(body.talentId ?? "").trim();
    if (!roleId) throw new InternalApiError(400, "roleId is required");
    if (!talentId) throw new InternalApiError(400, "talentId is required");
    if (typeof body.text !== "string") {
      throw new InternalApiError(400, "text is required");
    }

    const payload = await createOpsMatchingProgress({
      actorEmail: user.email ?? null,
      roleId,
      talentId,
      text: body.text,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to create talent progress"
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as ProgressBody;
    const progressId = String(body.progressId ?? "").trim();
    const talentId = String(body.talentId ?? "").trim();
    if (!progressId) throw new InternalApiError(400, "progressId is required");
    if (!talentId) throw new InternalApiError(400, "talentId is required");

    const payload = await deleteOpsMatchingProgress({
      progressId,
      roleId: body.roleId,
      talentId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to delete talent progress"
    );
  }
}
