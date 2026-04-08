import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsOpportunityCatalog } from "@/lib/opsOpportunity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const data = await fetchOpsOpportunityCatalog();
    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load opportunity catalog");
  }
}
