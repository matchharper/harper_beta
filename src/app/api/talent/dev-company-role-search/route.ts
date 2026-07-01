import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  canUseCareerDevSql,
  searchCompanyRolesFtsForDev,
} from "@/lib/career/devSql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeKeywords(value: unknown) {
  const rawKeywords = Array.isArray(value)
    ? value.flatMap((item) => String(item).split(/[\n,]+/))
    : String(value ?? "").split(/[\n,]+/);

  return Array.from(
    new Map(
      rawKeywords
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .map((keyword) => [keyword.toLowerCase(), keyword] as const)
    ).values()
  ).slice(0, 12);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canUseCareerDevSql(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      keywords?: unknown;
      limit?: unknown;
      sourceType?: unknown;
    };
    const keywords = normalizeKeywords(body.keywords);
    if (keywords.length === 0) {
      return NextResponse.json(
        { error: "검색 키워드를 입력해 주세요." },
        { status: 400 }
      );
    }

    const result = await searchCompanyRolesFtsForDev({
      keywords,
      limit: Number(body.limit ?? 25),
      sourceType: body.sourceType === "internal" ? "internal" : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "company_roles FTS 검색 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
