import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import type { OpsCompanyManagementEmployeeCountRangeFilter } from "@/lib/opsOpportunityCompanyManagement";
import {
  fetchOpsCompanyManagementPage,
  updateOpsCompanyScrapeOriginal,
} from "@/lib/opsOpportunity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") ?? "30");
    const offset = Number(searchParams.get("offset") ?? "0");
    const companyName = String(
      searchParams.get("companyName") ?? searchParams.get("query") ?? ""
    ).trim();
    const employeeCountRange = String(
      searchParams.get("employeeCountRange") ?? ""
    ).trim() as OpsCompanyManagementEmployeeCountRangeFilter;
    const location = String(searchParams.get("location") ?? "").trim();
    const investors = String(searchParams.get("investors") ?? "").trim();
    const foundedYearMin = String(
      searchParams.get("foundedYearMin") ?? ""
    ).trim();
    const hasCareerUrlOnly = searchParams.get("hasCareerUrlOnly") === "true";

    const data = await fetchOpsCompanyManagementPage({
      companyName,
      employeeCountRange,
      foundedYearMin,
      hasCareerUrlOnly,
      investors,
      limit,
      location,
      offset,
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load companies");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => null)) as {
      isScrapeOriginal?: unknown;
      workspaceId?: unknown;
    } | null;

    const data = await updateOpsCompanyScrapeOriginal({
      isScrapeOriginal: Boolean(body?.isScrapeOriginal),
      workspaceId: String(body?.workspaceId ?? ""),
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to update is_scrape_original"
    );
  }
}
