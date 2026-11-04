import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CAREER_TEXT_CHAT_MODEL_IDS } from "@/lib/career/textChatModelConfig";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import {
  lookupApplicationSuggestionsCandidate,
  previewApplicationSuggestionsDebug,
  runApplicationSuggestionsDebug,
} from "@/lib/ops/applicationSuggestionsDebug.server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const selection = {
  talentId: z.string().uuid(),
  documentId: z.string().uuid(),
  roleId: z.string().uuid(),
  model: z.enum(CAREER_TEXT_CHAT_MODEL_IDS).optional(),
  locale: z.string().optional(),
};
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lookup"), email: z.string().trim().email() }).strict(),
  z.object({ action: z.literal("preview"), ...selection }).strict(),
  z.object({ action: z.literal("run"), ...selection }).strict(),
]);

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json({ error: "이메일 또는 사용자·이력서·공고 선택을 확인해 주세요." }, { status: 400 });
    const input = parsed.data;
    const options = { signal: AbortSignal.any([req.signal, AbortSignal.timeout(290_000)]) };
    const result = input.action === "lookup"
      ? await lookupApplicationSuggestionsCandidate(input.email, options)
      : input.action === "preview"
        ? await previewApplicationSuggestionsDebug(input, options)
        : await runApplicationSuggestionsDebug(input, options);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toInternalApiErrorResponse(error, "이력서 제안을 실행하지 못했습니다.");
  }
}
