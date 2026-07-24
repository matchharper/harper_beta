import { NextRequest, NextResponse } from "next/server";
import {
  createOrgSlackAuthorizeUrl,
  disconnectOrgSlackIntegration,
  getOrgSlackIntegrationStatus,
  OrgSlackIntegrationError,
  sendOrgSlackTestMessage,
  updateOrgSlackNotificationSettings,
} from "@/lib/org/slackIntegration";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgSlackIntegrationError) {
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
    const payload = await getOrgSlackIntegrationStatus({
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
      action?: "connect" | "test";
      returnTo?: string;
      workspaceId?: string;
    };

    if (body.action === "connect") {
      const authorizeUrl = await createOrgSlackAuthorizeUrl({
        origin: req.nextUrl.origin,
        returnTo: body.returnTo,
        user,
        workspaceId: body.workspaceId ?? "",
      });
      return NextResponse.json({ authorizeUrl });
    }

    if (body.action === "test") {
      const payload = await sendOrgSlackTestMessage({
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
      workspaceId?: string;
    };
    const payload = await disconnectOrgSlackIntegration({
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      notifications?: {
        candidateAccepted?: boolean;
        candidateRejected?: boolean;
        memberJoined?: boolean;
      };
      workspaceId?: string;
    };
    const payload = await updateOrgSlackNotificationSettings({
      notifications: body.notifications ?? {},
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
