import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { OPS_TRACKED_CHANGE_KEYS } from "@/lib/ops/updateMetrics";
import {
  listOpsTrackedChangeStates,
  setOpsTrackedChangeEnded,
} from "@/lib/ops/trackedChanges.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which tracked changes a team member ended (ops_tracked_changes). */
export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json({ states: await listOpsTrackedChangeStates() });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load tracked changes");
  }
}

/** Ends or resumes tracking one change: { key, ended }. */
export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => null)) as { ended?: unknown; key?: unknown } | null;
    const key = typeof body?.key === "string" ? body.key : "";
    if (!OPS_TRACKED_CHANGE_KEYS.has(key) || typeof body?.ended !== "boolean") {
      return NextResponse.json({ error: "추적할 변화를 찾지 못했습니다." }, { status: 400 });
    }
    await setOpsTrackedChangeEnded({ ended: body.ended, key });
    return NextResponse.json({ states: await listOpsTrackedChangeStates() });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save tracked change");
  }
}
