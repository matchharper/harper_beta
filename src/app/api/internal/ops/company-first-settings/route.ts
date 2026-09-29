import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchCompanyFirstSettings,
  saveCompanyFirstSettings,
} from "@/lib/ops/companyFirstSettingsServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(value: unknown) {
  return NextResponse.json(value, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return json(await fetchCompanyFirstSettings());
  } catch (error) {
    return toInternalApiErrorResponse(error, "설정을 불러오지 못했습니다.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return json(await saveCompanyFirstSettings(await req.json()));
  } catch (error) {
    return toInternalApiErrorResponse(error, "설정을 저장하지 못했습니다.");
  }
}
