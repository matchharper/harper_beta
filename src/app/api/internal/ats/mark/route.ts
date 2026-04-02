import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  isAtsSequenceMarkStatus,
  type AtsSequenceMarkStatus,
} from "@/lib/ats/shared";
import { setAtsSequenceMark } from "@/lib/ats/server";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      candidId?: string;
      sequenceMark?: string | null;
    };
    const candidId = String(body.candidId ?? "").trim();
    const rawSequenceMark =
      body.sequenceMark == null ? null : String(body.sequenceMark).trim();
    const sequenceMark: AtsSequenceMarkStatus | null = rawSequenceMark
      ? isAtsSequenceMarkStatus(rawSequenceMark)
        ? rawSequenceMark
        : null
      : null;

    if (!candidId) {
      return NextResponse.json(
        { error: "candidId is required" },
        { status: 400 }
      );
    }

    if (rawSequenceMark && !isAtsSequenceMarkStatus(rawSequenceMark)) {
      return NextResponse.json(
        { error: "Invalid sequence mark" },
        { status: 400 }
      );
    }

    const outreach = await setAtsSequenceMark({
      candidId,
      sequenceMark,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, outreach });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save sequence mark");
  }
}
