import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  inspectionHttpsUrl,
  loadInspectionRole,
} from "@/lib/ops/applicationLinkResolution.server";
import { runQuestionsDebug } from "@/lib/ops/applicationQuestionsDebug.server";
import { questionProviders } from "@/lib/ops/applicationQuestions";
import {
  QuestionsAgentError,
  readBrowserUseSessionCost,
} from "@/lib/ops/applicationQuestionsAgents.server";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const sessionId = z
      .string()
      .uuid()
      .safeParse(req.nextUrl.searchParams.get("sessionId"));
    if (!sessionId.success)
      return NextResponse.json(
        { error: "유효한 세션 ID가 필요합니다." },
        { status: 400 }
      );
    return NextResponse.json(
      await readBrowserUseSessionCost(sessionId.data, req.signal),
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "비용을 조회하지 못했습니다.");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const input = z
      .object({
        url: z.string().trim().url().optional(),
        roleId: z.string().uuid().optional(),
        resolveOfficialLink: z.boolean().default(false),
        provider: z.enum(questionProviders).default("current"),
        model: z.string().trim().min(1).default("gpt-6-luna"),
      })
      .strict()
      .refine(
        (value) => value.url || (value.resolveOfficialLink && value.roleId)
      )
      .safeParse(await req.json().catch(() => null));
    if (!input.success)
      return NextResponse.json(
        { error: "지원 페이지 URL을 입력해 주세요." },
        { status: 400 }
      );
    let url = "";
    try {
      if (input.data.url) url = inspectionHttpsUrl(input.data.url);
    } catch {
      return NextResponse.json(
        { error: "공개 HTTPS 지원 페이지가 필요합니다." },
        { status: 400 }
      );
    }
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(750_000)]);
    const source =
      input.data.resolveOfficialLink && input.data.roleId && !input.data.url
        ? await loadInspectionRole(input.data.roleId, signal)
        : url;
    const result = await runQuestionsDebug(
      {
        source,
        provider: input.data.provider,
        model: input.data.model,
        resolveOfficialLink: input.data.resolveOfficialLink,
      },
      signal
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof QuestionsAgentError)
      return NextResponse.json(
        { error: error.message, execution: error.execution },
        {
          status: 502,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
    return toInternalApiErrorResponse(error, "질문을 가져오지 못했습니다.");
  }
}
