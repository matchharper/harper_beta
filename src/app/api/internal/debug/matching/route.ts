import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsDebugInternalMatching,
  parseOpsDebugInternalMatchingRoleMode,
} from "@/lib/ops/debugInternalMatchingServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchOpsDebugInternalMatching({
      from: req.nextUrl.searchParams.get("from"),
      roleMode: parseOpsDebugInternalMatchingRoleMode(
        req.nextUrl.searchParams.get("roleMode")
      ),
      to: req.nextUrl.searchParams.get("to"),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load internal matching metrics"
    );
  }
}
