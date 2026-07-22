import { NextRequest, NextResponse } from "next/server";
import { fetchOrgInvitePreview, OrgHttpError } from "@/lib/org/server";

export async function GET(req: NextRequest) {
  try {
    const payload = await fetchOrgInvitePreview({
      workspaceId: req.nextUrl.searchParams.get("orgId") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof OrgHttpError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[org/invite-preview]", error);
    return NextResponse.json(
      { error: "초대 정보를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
