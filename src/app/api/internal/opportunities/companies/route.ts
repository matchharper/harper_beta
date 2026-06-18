import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
  type OpsCompanyManagementEmployeeCountRangeFilter,
  type OpsCompanyManagementQualityLabelFilter,
} from "@/lib/ops/opportunityCompanyManagement";
import {
  fetchOpsCompanyManagementPage,
  updateOpsCompanyScrapeOriginal,
} from "@/lib/ops/opportunity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const limit = Number(
      searchParams.get("limit") ?? String(OPS_COMPANY_MANAGEMENT_PAGE_SIZE)
    );
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
    const humanLabelMissingFirst =
      searchParams.get("humanLabelMissingFirst") === "true";
    const llmQualityLabelFirst =
      searchParams.get("llmQualityLabelFirst") === "true";
    const qualityLabel = String(searchParams.get("qualityLabel") ?? "")
      .trim()
      .toLowerCase() as OpsCompanyManagementQualityLabelFilter;

    const data = await fetchOpsCompanyManagementPage({
      companyName,
      employeeCountRange,
      foundedYearMin,
      hasCareerUrlOnly,
      humanLabelMissingFirst,
      investors,
      limit,
      llmQualityLabelFirst,
      location,
      offset,
      qualityLabel,
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
