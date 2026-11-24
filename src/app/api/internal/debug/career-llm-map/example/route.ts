import { NextRequest, NextResponse } from "next/server";
import { InternalApiError, requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { canInspectCareerAgentMessages } from "@/lib/internalAccess";
import { buildCareerLlmMapExample } from "@/lib/ops/careerLlmMap/example";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    // The rebuilt input includes the talent's conversation and Memory.
    if (!canInspectCareerAgentMessages(user.email)) throw new InternalApiError(403, "Forbidden");
    const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
    if (!email) throw new InternalApiError(400, "email이 필요합니다.");
    const example = await buildCareerLlmMapExample(email);
    return NextResponse.json(example, {headers: {"Cache-Control": "private, no-store"}});
  } catch (error) {
    return toInternalApiErrorResponse(error, "실제 입력 예시를 만들지 못했습니다.");
  }
}
