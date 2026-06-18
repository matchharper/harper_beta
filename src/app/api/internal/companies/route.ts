import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  OPS_COMPANIES_PAGE_SIZE,
  fetchOpsCompaniesPage,
  updateOpsCompanyTestScore,
} from "@/lib/ops/companies";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const limit = Number(
      searchParams.get("limit") ?? String(OPS_COMPANIES_PAGE_SIZE)
    );
    const offset = Number(searchParams.get("offset") ?? "0");
    const query = String(
      searchParams.get("query") ?? searchParams.get("companyName") ?? ""
    ).trim();

    const data = await fetchOpsCompaniesPage({
      limit,
      offset,
      query,
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
      testScore?: unknown;
      workspaceId?: unknown;
    } | null;

    const data = await updateOpsCompanyTestScore({
      testScore: Number(body?.testScore),
      workspaceId: String(body?.workspaceId ?? ""),
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update test_score");
  }
}
