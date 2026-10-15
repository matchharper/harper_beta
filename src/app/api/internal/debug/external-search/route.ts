import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { searchFitOptions } from "@/lib/ops/externalFitPlaygroundServer";
import { previewExternalSearch } from "@/lib/ops/externalSearchPreview.server";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

function json(data: unknown) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
function failure(error: unknown) {
  const response = toInternalApiErrorResponse(
    error,
    "공고를 검색하지 못했습니다."
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (query.length > 120)
      throw new InternalApiError(400, "검색어는 120자까지 입력하세요.");
    return json(await searchFitOptions("talents", query, 0));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return json(
      await previewExternalSearch(
        await req.json().catch(() => null),
        AbortSignal.any([req.signal, AbortSignal.timeout(165_000)])
      )
    );
  } catch (error) {
    return failure(error);
  }
}
