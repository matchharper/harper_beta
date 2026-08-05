import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { getCompanyEventActorLabelFromUser } from "@/lib/org/companyEvents";
import {
  fetchOpsMatchingAllRoles,
  parseOpsMatchingLimit,
  parseOpsMatchingOffset,
  updateOpsMatchingAllRole,
} from "@/lib/ops/matching";
import type { OpportunityStatus } from "@/lib/ops/opportunity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchOpsMatchingAllRoles({
      limit: parseOpsMatchingLimit(req.nextUrl.searchParams.get("limit")),
      offset: parseOpsMatchingOffset(req.nextUrl.searchParams.get("offset")),
      query: req.nextUrl.searchParams.get("query"),
      selfServeOnly: req.nextUrl.searchParams.get("selfServeOnly") === "true",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load all roles");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      isAuto?: unknown;
      roleId?: unknown;
      status?: unknown;
    };
    const status = ["active", "ended", "paused", "top_priority"].includes(
      String(body.status ?? "")
    )
      ? (body.status as OpportunityStatus)
      : undefined;
    const payload = await updateOpsMatchingAllRole({
      eventActorLabel: getCompanyEventActorLabelFromUser(user),
      isAuto: typeof body.isAuto === "boolean" ? body.isAuto : undefined,
      roleId: String(body.roleId ?? ""),
      status,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update role");
  }
}
