import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import type { OpsOrgAgentToolDebugRunInput } from "@/lib/ops/orgAgentToolDebugger";
import {
  fetchOpsOrgAgentToolDebugActors,
  fetchOpsOrgAgentToolDebugWorkspaces,
  runOpsOrgAgentToolDebug,
} from "@/lib/ops/orgAgentToolDebuggerServer";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const payload = workspaceId
      ? await fetchOpsOrgAgentToolDebugActors(workspaceId)
      : await fetchOpsOrgAgentToolDebugWorkspaces();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load company-side LLM tool debugger options"
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req
      .json()
      .catch(() => ({}))) as OpsOrgAgentToolDebugRunInput;
    return NextResponse.json(await runOpsOrgAgentToolDebug(body));
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to run company-side LLM tool debugger"
    );
  }
}
