import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { saveCareerTalentOpsProfileMemo } from "@/lib/opsCareerServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      content?: unknown;
      userId?: unknown;
    };

    if (typeof body.userId !== "string" || !body.userId.trim()) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const memo = await saveCareerTalentOpsProfileMemo({
      content: body.content,
      updatedBy: user.email,
      userId: body.userId,
    });

    return NextResponse.json({ memo, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save profile memo");
  }
}
