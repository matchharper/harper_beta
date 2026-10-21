import { NextRequest, NextResponse } from "next/server";
import { InternalApiError, requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { sendOpsReengagement } from "@/lib/ops/privateReengagement";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = await req.json();
    for (const field of ["requestId", "roleId", "talentId", "subject", "body"]) {
      if (typeof body[field] !== "string" || !body[field].trim()) {
        throw new InternalApiError(400, `${field} is required`);
      }
    }
    if (body.subject.length > 180 || body.body.length > 5000) {
      throw new InternalApiError(400, "안내 문구가 너무 깁니다.");
    }
    return NextResponse.json(await sendOpsReengagement({
      requestId: body.requestId, roleId: body.roleId, talentId: body.talentId,
      subject: body.subject.trim(), body: body.body.trim(), actorEmail: user.email ?? user.id,
    }));
  } catch (error) {
    return toInternalApiErrorResponse(error, "채용 재개 안내를 접수하지 못했습니다.");
  }
}
