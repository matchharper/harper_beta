import { type NextRequest, NextResponse } from "next/server";
import {
  fetchMeetingAvailability,
  saveMeetingAvailability,
} from "@/lib/meetings/availabilityServer";
import { OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

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
  console.error("[org/meeting-availability]", error);
  return NextResponse.json(
    { error: "인터뷰 가능 시간을 처리하지 못했습니다." },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const payload = await fetchMeetingAvailability({
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      availability?: unknown;
      expectedVersion?: number | null;
      workspaceId?: string;
    };
    const payload = await saveMeetingAvailability({
      availability: body.availability,
      expectedVersion:
        typeof body.expectedVersion === "number" ? body.expectedVersion : null,
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
