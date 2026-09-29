import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  createCompanyTalentResumeUploadToken,
  fetchActiveCompanyTalentRequest,
  verifyCompanyTalentResumeUploadToken,
} from "@/lib/companyTalentRequests/server";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tokenValue = req.nextUrl.searchParams.get("token") ?? "";
  const token = tokenValue
    ? verifyCompanyTalentResumeUploadToken(tokenValue)
    : null;
  if (tokenValue && (!token || token.talentId !== user.id)) {
    return NextResponse.json(
      { error: "Invalid or expired request link" },
      { status: 400 }
    );
  }
  // A generic profile upload must not silently become a company transmission.
  // Only the exact company contact link supplies that explicit destination.
  if (!token) return NextResponse.json({ ok: true, request: null });
  const request = await fetchActiveCompanyTalentRequest({
    admin: getTalentSupabaseAdmin() as any,
    awaitingTalentOnly: true,
    requestId: token?.requestId ?? null,
    talentId: user.id,
  });
  if (!request) {
    if (!tokenValue) {
      return NextResponse.json({ ok: true, request: null });
    }
    return NextResponse.json(
      { error: "This request is no longer active" },
      { status: 404 }
    );
  }
  return NextResponse.json({
    ok: true,
    request: {
      companyName: request.workspace?.company_name ?? "채용 회사",
      expiresAt: null,
      requestId: request.id,
      roleName: request.role?.name ?? "해당 포지션",
      token:
        tokenValue ||
        createCompanyTalentResumeUploadToken({
          requestId: request.id,
          talentId: user.id,
        }),
    },
  });
}
