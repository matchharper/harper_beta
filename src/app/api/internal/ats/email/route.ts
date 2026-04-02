import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  discoverCandidateEmail,
  setManualCandidateEmail,
} from "@/lib/ats/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      candidId?: string;
    };
    const candidId = String(body.candidId ?? "").trim();

    if (!candidId) {
      return NextResponse.json(
        { error: "candidId is required" },
        { status: 400 }
      );
    }

    const outreach = await discoverCandidateEmail({
      candidId,
      req,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, outreach });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to discover candidate email");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      candidId?: string;
      email?: string;
    };
    const candidId = String(body.candidId ?? "").trim();
    const email = String(body.email ?? "").trim();

    if (!candidId || !email) {
      return NextResponse.json(
        { error: "candidId and email are required" },
        { status: 400 }
      );
    }

    const outreach = await setManualCandidateEmail({
      candidId,
      email,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, outreach });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save candidate email");
  }
}
