import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsMatchingCompanies } from "@/lib/opsMatching";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const items = await fetchOpsMatchingCompanies({
      query: req.nextUrl.searchParams.get("query"),
    });
    return NextResponse.json({ items });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load matching companies"
    );
  }
}
