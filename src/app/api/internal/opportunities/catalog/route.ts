import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsOpportunityCatalog } from "@/lib/opsOpportunity";
import { OPS_OPPORTUNITY_COMPANY_PAGE_SIZE } from "@/lib/opsOpportunityCompanyManagement";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const data = await fetchOpsOpportunityCatalog({
      internalOnly: searchParams.get("internalOnly") === "true",
      workspaceLimit: Number(
        searchParams.get("limit") ?? String(OPS_OPPORTUNITY_COMPANY_PAGE_SIZE)
      ),
      workspaceOffset: Number(searchParams.get("offset") ?? "0"),
      workspaceQuery: String(
        searchParams.get("workspaceQuery") ?? searchParams.get("query") ?? ""
      ),
    });
    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load opportunity catalog"
    );
  }
}
