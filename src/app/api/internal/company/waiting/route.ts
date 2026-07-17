import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsCompanyWaiting } from "@/lib/ops/company";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(await fetchOpsCompanyWaiting());
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load company waiting list"
    );
  }
}
