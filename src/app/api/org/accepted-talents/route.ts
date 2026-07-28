import { NextRequest, NextResponse } from "next/server";
import { fetchOrgAcceptedTalents, OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/accepted-talents]", error);
  return NextResponse.json(
    { error: "수락한 인재를 불러오지 못했습니다." },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const payload = await fetchOrgAcceptedTalents({
      offset: Number(req.nextUrl.searchParams.get("offset") ?? 0),
      user,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
