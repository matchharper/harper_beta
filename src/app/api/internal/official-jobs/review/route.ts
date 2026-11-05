import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { markOpsOfficialJobReviewed } from "@/lib/ops/officialJobs";

export const runtime = "nodejs";

/** Ops marks a posting reviewed after its Role's Brief changed. */
export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    const payload = await markOpsOfficialJobReviewed(String(body.id ?? ""));
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to mark official job reviewed");
  }
}
