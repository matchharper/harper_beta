import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  deleteOpsOpportunityMatch,
  fetchOpsOpportunityMatches,
  saveOpsOpportunityMatch,
} from "@/lib/opsOpportunity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const candidId = String(searchParams.get("candidId") ?? "").trim() || null;
    const roleId = String(searchParams.get("roleId") ?? "").trim() || null;

    const data = await fetchOpsOpportunityMatches({
      candidId,
      roleId,
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load matches");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      candidId?: string;
      harperMemo?: string | null;
      roleId?: string;
    };

    const data = await saveOpsOpportunityMatch({
      candidId: String(body.candidId ?? ""),
      harperMemo: body.harperMemo,
      roleId: String(body.roleId ?? ""),
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save match");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      candidId?: string;
      roleId?: string;
    };

    const data = await deleteOpsOpportunityMatch({
      candidId: String(body.candidId ?? ""),
      roleId: String(body.roleId ?? ""),
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to delete match");
  }
}
