import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { runOpsEmailTest } from "@/lib/ops/careerEmailTest.server";

export const runtime = "nodejs";
export const maxDuration = 480;
const commandSchema = z
  .object({
    userId: z.string().uuid(),
    jobId: z.string().uuid(),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const parsed = commandSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "계정과 테스트를 확인해 주세요." },
        { status: 400 }
      );
    return NextResponse.json(
      await runOpsEmailTest(parsed.data.userId, parsed.data.jobId)
    );
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "이메일 테스트를 실행하지 못했습니다."
    );
  }
}
