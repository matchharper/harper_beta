import { NextRequest, NextResponse } from "next/server";
import {
  requireAtsApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  generateCandidateSequence,
  sendCandidateSequenceStep,
  updateAtsSequenceStatus,
} from "@/lib/ats/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAtsApiUser(req);
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

    const data = await generateCandidateSequence({
      candidId,
      userEmail: user.email,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to generate ATS sequence");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAtsApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      action?: "pause" | "resume" | "send";
      candidId?: string;
      stepNumber?: number;
    };
    const candidId = String(body.candidId ?? "").trim();

    if (!candidId) {
      return NextResponse.json(
        { error: "candidId is required" },
        { status: 400 }
      );
    }

    if (body.action === "send") {
      const data = await sendCandidateSequenceStep({
        candidId,
        stepNumber: Number(body.stepNumber ?? 0),
        userEmail: user.email,
        userId: user.id,
      });

      return NextResponse.json({ ok: true, data });
    }

    if (body.action === "pause" || body.action === "resume") {
      const outreach = await updateAtsSequenceStatus({
        candidId,
        paused: body.action === "pause",
        userId: user.id,
      });

      return NextResponse.json({ ok: true, outreach });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update ATS sequence");
  }
}
