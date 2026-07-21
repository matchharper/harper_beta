import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  createOrgTalentFeedItem,
  deleteOrgTalentFeedItem,
  OrgHttpError,
  type OrgFeedCreateResponse,
  type OrgFeedMutationResponse,
  updateOrgTalentFeedItem,
} from "@/lib/org/server";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/feed]", error);
  return NextResponse.json({ error: "Failed to create feed" }, { status: 500 });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      recommendationId?: string | null;
      roleId?: string;
      talentId?: string;
      text?: string;
      workspaceId?: string;
    };
    const payload: OrgFeedCreateResponse = await createOrgTalentFeedItem({
      recommendationId: body.recommendationId ?? null,
      roleId: body.roleId ?? "",
      talentId: body.talentId ?? "",
      text: body.text ?? "",
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
      progressId?: string;
      text?: string;
      workspaceId?: string;
    };
    const payload: OrgFeedMutationResponse = await updateOrgTalentFeedItem({
      progressId: body.progressId ?? "",
      text: body.text ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      progressId?: string;
      workspaceId?: string;
    };
    const payload: OrgFeedMutationResponse = await deleteOrgTalentFeedItem({
      progressId: body.progressId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
