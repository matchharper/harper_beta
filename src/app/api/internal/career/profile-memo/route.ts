import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  createCareerTalentOpsProfileMemo,
  deleteCareerTalentOpsProfileMemo,
  updateCareerTalentOpsProfileMemo,
} from "@/lib/ops/careerServer";

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

    const memo = await createCareerTalentOpsProfileMemo({
      content: body.content,
      createdBy: user.email,
      userId: body.userId,
    });

    return NextResponse.json({ memo, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to create profile memo");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      content?: unknown;
      memoId?: unknown;
      userId?: unknown;
    };

    if (typeof body.userId !== "string" || !body.userId.trim()) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }
    if (typeof body.memoId !== "string" || !body.memoId.trim()) {
      return NextResponse.json(
        { error: "memoId is required" },
        { status: 400 }
      );
    }

    const memo = await updateCareerTalentOpsProfileMemo({
      content: body.content,
      memoId: body.memoId,
      updatedBy: user.email,
      userId: body.userId,
    });

    return NextResponse.json({ memo, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update profile memo");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      memoId?: unknown;
      userId?: unknown;
    };

    if (typeof body.userId !== "string" || !body.userId.trim()) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }
    if (typeof body.memoId !== "string" || !body.memoId.trim()) {
      return NextResponse.json(
        { error: "memoId is required" },
        { status: 400 }
      );
    }

    const result = await deleteCareerTalentOpsProfileMemo({
      memoId: body.memoId,
      userId: body.userId,
    });

    return NextResponse.json({ ...result, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to delete profile memo");
  }
}
