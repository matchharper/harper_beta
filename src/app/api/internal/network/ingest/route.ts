import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { ingestNetworkLeadProfile } from "@/lib/opsNetworkServer";

export const runtime = "nodejs";

type Body = {
  id?: number;
};

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const body = (await req.json().catch(() => ({}))) as Body;
    const leadId = Number(body.id ?? "");
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const result = await ingestNetworkLeadProfile({ leadId });

    return NextResponse.json({
      ingestion: {
        linkedinUrl: result.ingestion.linkedinUrl,
        llm: result.ingestion.llm,
        stats: result.ingestion.stats,
      },
      ok: true,
      resumeTextIncluded: result.resumeTextIncluded,
      talentId: result.talentId,
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to extract candidate information"
    );
  }
}
