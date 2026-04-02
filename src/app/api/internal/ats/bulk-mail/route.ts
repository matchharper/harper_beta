import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendBulkAtsManualEmails } from "@/lib/ats/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      body?: string;
      candidIds?: string[];
      senderEmail?: string;
      subject?: string;
    };

    const result = await sendBulkAtsManualEmails({
      body: String(body.body ?? ""),
      candidIds: Array.isArray(body.candidIds) ? body.candidIds : [],
      senderEmail: body.senderEmail,
      subject: String(body.subject ?? ""),
      userEmail: user.email,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to send ATS bulk mail");
  }
}
