import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { insertTalentInternalEntry } from "@/lib/opsNetworkServer";
import type { TalentInternalType } from "@/lib/opsNetwork";

export const runtime = "nodejs";

type Body = {
  content?: string;
  id?: number;
  type?: TalentInternalType;
};

const ALLOWED_TYPES = new Set<TalentInternalType>(["conversation", "memo"]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const leadId = Number(body.id ?? "");
    const type = body.type;
    const content = String(body.content ?? "").trim();

    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }
    if (!type || !ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: "Invalid internal type" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const entry = await insertTalentInternalEntry({
      content,
      createdBy: user.email ?? "unknown@matchharper.com",
      leadId,
      type,
    });

    return NextResponse.json({ entry, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to save internal candidate note"
    );
  }
}
