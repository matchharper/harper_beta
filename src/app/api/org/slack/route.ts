import { NextRequest, NextResponse } from "next/server";
import {
  addHarperSlackChannel,
  createHarperSlackChannel,
  createHarperSlackAuthorizeUrl,
  getHarperSlackStatus,
  HarperSlackError,
  removeHarperSlackChannel,
} from "@/lib/org/slackHarper";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

function toErrorResponse(error: unknown) {
  if (error instanceof HarperSlackError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/slack]", error);
  return NextResponse.json(
    { error: "Slack 요청을 처리하지 못했습니다." },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const payload = await getHarperSlackStatus({
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      action?: "add_channel" | "connect" | "create_channel";
      channelId?: string | null;
      channelName?: string | null;
      isPrivate?: boolean;
      returnTo?: string;
      workspaceId?: string;
    };

    if (body.action === "connect") {
      const authorizeUrl = await createHarperSlackAuthorizeUrl({
        origin: req.nextUrl.origin,
        returnTo: body.returnTo,
        user,
        workspaceId: body.workspaceId ?? "",
      });
      return NextResponse.json({ authorizeUrl });
    }

    if (body.action === "add_channel") {
      const payload = await addHarperSlackChannel({
        channelId: body.channelId ?? "",
        user,
        workspaceId: body.workspaceId ?? "",
      });
      return NextResponse.json(payload);
    }

    if (body.action === "create_channel") {
      const payload = await createHarperSlackChannel({
        channelName: body.channelName ?? "",
        isPrivate: body.isPrivate === true,
        user,
        workspaceId: body.workspaceId ?? "",
      });
      return NextResponse.json(payload);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      channelId?: string;
      workspaceId?: string;
    };
    const payload = await removeHarperSlackChannel({
      channelId: body.channelId,
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
