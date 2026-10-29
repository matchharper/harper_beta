import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { createOpsEmailTest, fetchOpsEmailTests } from "@/lib/ops/careerEmailTest.server";

export const runtime = "nodejs";
const commandSchema = z.object({
  userId: z.string().uuid(), requestId: z.string().uuid(),
  previousJobId: z.string().uuid().optional(),
  subject: z.string().trim(), content: z.string().trim().min(1),
  model: z.string().trim().min(1).optional(),
}).strict();

export async function POST(req: NextRequest) {
  try {
    const actor = await requireInternalApiUser(req);
    const parsed = commandSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "계정과 메시지를 확인해 주세요." }, { status: 400 });
    return NextResponse.json(await createOpsEmailTest(parsed.data, actor.id));
  } catch (error) {
    return toInternalApiErrorResponse(error, "이메일 테스트를 시작하지 못했습니다.");
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const userId = z.string().uuid().safeParse(req.nextUrl.searchParams.get("userId"));
    const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
    if (!userId.success || !Number.isSafeInteger(offset) || offset < 0)
      return NextResponse.json({ error: "계정과 페이지를 확인해 주세요." }, { status: 400 });
    return NextResponse.json(await fetchOpsEmailTests(userId.data, offset));
  } catch (error) {
    return toInternalApiErrorResponse(error, "이메일 테스트를 불러오지 못했습니다.");
  }
}
