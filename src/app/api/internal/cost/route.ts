import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsCosts, parseOpsCostDateRange } from "@/lib/ops/costServer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const range = parseOpsCostDateRange({
      from: req.nextUrl.searchParams.get("from"),
      through: req.nextUrl.searchParams.get("through"),
    });
    return NextResponse.json(await fetchOpsCosts(range));
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load costs");
  }
}
