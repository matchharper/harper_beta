import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
  InternalApiError,
} from "@/lib/internalApi";
import {
  getCareerGmailDebugOptions,
  runCareerGmailDebug,
} from "@/lib/ops/careerGmailDebug.server";

export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    return NextResponse.json(await getCareerGmailDebugOptions(user), {
      headers,
    });
  } catch (error) {
    const response = toInternalApiErrorResponse(
      error,
      "Gmail 도구를 불러오지 못했습니다."
    );
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const input: unknown = await req.json().catch(() => {
      throw new InternalApiError(400, "올바른 JSON을 입력해 주세요.");
    });
    return NextResponse.json(await runCareerGmailDebug(user, input), {
      headers,
    });
  } catch (error) {
    const response = toInternalApiErrorResponse(
      error,
      "Gmail 조회에 실패했습니다."
    );
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
}
