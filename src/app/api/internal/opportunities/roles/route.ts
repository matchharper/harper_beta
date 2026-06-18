import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsOpportunityRoles,
  type OpportunitySourceType,
} from "@/lib/ops/opportunity";

export const runtime = "nodejs";

const parseSourceType = (value: string | null): OpportunitySourceType | null =>
  value === "internal" || value === "external" ? value : null;

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const data = await fetchOpsOpportunityRoles({
      internalOnly: searchParams.get("internalOnly") === "true",
      limit: Number(searchParams.get("limit") ?? "25"),
      offset: Number(searchParams.get("offset") ?? "0"),
      query: searchParams.get("query") ?? "",
      sourceType: parseSourceType(searchParams.get("sourceType")),
      workspaceId: searchParams.get("workspaceId") ?? null,
    });
    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load opportunity roles"
    );
  }
}
