import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  runSalaryEstimation,
  searchSalaryRoles,
} from "@/lib/ops/roleSalaryEstimationServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const json = (value: unknown) =>
  NextResponse.json(value, {
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  const response = toInternalApiErrorResponse(
    error,
    "연봉 추정 요청에 실패했습니다."
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return json(
      await searchSalaryRoles(Object.fromEntries(req.nextUrl.searchParams))
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return json(
      await runSalaryEstimation(await req.json().catch(() => null), req.signal)
    );
  } catch (error) {
    return failure(error);
  }
}
