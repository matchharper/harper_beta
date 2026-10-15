import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  runExternalFitPlayground,
  searchFitOptions,
} from "@/lib/ops/externalFitPlaygroundServer";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function json(data: unknown) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
function failure(error: unknown) {
  const response = toInternalApiErrorResponse(
    error,
    "Fit 테스트 요청에 실패했습니다."
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const kind = req.nextUrl.searchParams.get("kind");
    const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
    const talentId = req.nextUrl.searchParams.get("talentId");
    if (
      (kind !== "roles" && kind !== "talents") ||
      query.length > 120 ||
      (talentId !== null && !z.string().uuid().safeParse(talentId).success) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100_000
    )
      throw new InternalApiError(400, "검색 조건이 올바르지 않습니다.");
    return json(await searchFitOptions(kind, query, offset, talentId));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return json(
      await runExternalFitPlayground(await req.json().catch(() => null))
    );
  } catch (error) {
    return failure(error);
  }
}
