import { after, NextRequest, NextResponse } from "next/server";
import { runSignupResearch } from "@/lib/org/signupServer";

import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  OrgHttpError,
  createOrgWorkspace,
  updateOrgWorkspace,
  type OrgWorkspaceUpdateFields,
} from "@/lib/org/server";

export const maxDuration = 90;

function toErrorResponse(error: unknown) {
  if (error instanceof Error && error.message.startsWith("signup_")) {
    return NextResponse.json(
      { error: error.message },
      {
        status:
          error.message === "signup_forbidden"
            ? 403
            : error.message === "signup_unavailable"
              ? 503
              : 400,
      }
    );
  }
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/workspace]", error);
  return NextResponse.json(
    { error: "Failed to update workspace" },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) ?? {};
    const result = await createOrgWorkspace({
      user,
      sourceWorkspaceId: body.sourceWorkspaceId,
      homepageUrl: body.homepageUrl,
      requestId: body.requestId,
    });
    if (result.status === "created" && result.workspaceId)
      after(() => runSignupResearch(user.id, result.workspaceId!));
    return NextResponse.json(result, {
      status: result.status === "created" ? 201 : 200,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req
      .json()
      .catch(() => ({}))) as OrgWorkspaceUpdateFields & {
      workspaceId?: string;
    };
    const payload = await updateOrgWorkspace({
      ...body,
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
