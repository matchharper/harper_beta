import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  addOpsMatchingTalentTag,
  deleteOpsMatchingTalentTag,
  fetchOpsMatchingTalentRoleTags,
} from "@/lib/ops/matching";

export const runtime = "nodejs";

type TagBody = {
  roleId?: string;
  tag?: unknown;
  tagId?: string;
  talentId?: string;
};

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const talentId = req.nextUrl.searchParams.get("talentId")?.trim() ?? "";
    if (!talentId) throw new InternalApiError(400, "talentId is required");

    const payload = await fetchOpsMatchingTalentRoleTags({ talentId });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load matching tags");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as TagBody;
    const roleId = typeof body.roleId === "string" ? body.roleId.trim() : null;
    const talentId = String(body.talentId ?? "").trim();
    if (!talentId) throw new InternalApiError(400, "talentId is required");
    if (typeof body.tag !== "string") {
      throw new InternalApiError(400, "tag is required");
    }

    const tags = await addOpsMatchingTalentTag({
      roleId,
      tag: body.tag,
      talentId,
    });
    return NextResponse.json({ tags });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save matching tag");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as TagBody;
    const roleId = typeof body.roleId === "string" ? body.roleId.trim() : null;
    const talentId = String(body.talentId ?? "").trim();
    const tagId = String(body.tagId ?? "").trim();
    if (!talentId) throw new InternalApiError(400, "talentId is required");
    if (!tagId) throw new InternalApiError(400, "tagId is required");

    const tags = await deleteOpsMatchingTalentTag({
      roleId,
      tagId,
      talentId,
    });
    return NextResponse.json({ tags });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to delete matching tag");
  }
}
