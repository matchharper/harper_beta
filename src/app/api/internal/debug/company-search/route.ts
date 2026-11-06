import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { CAREER_COMPANY_TOOLS } from "@/lib/career/companies/tools";
import { companySearchInputSchema } from "@/lib/career/companies/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import type { CompanySearchDebugResponse } from "@/lib/ops/companySearchDebug";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const parsed = companySearchInputSchema.safeParse(
      await req.json().catch(() => null)
    );
    if (!parsed.success) {
      throw new InternalApiError(
        400,
        "검색어 배열과 0 이상의 정수 offset을 입력해 주세요."
      );
    }
    const admin = getTalentSupabaseAdmin();
    const started = performance.now();
    const result = (await CAREER_COMPANY_TOOLS.search_companies.execute!(
      parsed.data,
      { admin, userId: user.id }
    )) as Omit<CompanySearchDebugResponse, "input" | "durationMs">;
    return NextResponse.json(
      {
        ...result,
        input: parsed.data,
        durationMs: Math.round(performance.now() - started),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "회사 검색에 실패했습니다.");
  }
}
