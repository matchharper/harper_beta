import { NextRequest, NextResponse } from "next/server";
import {
  requireAtsApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendBulkAtsManualEmails } from "@/lib/ats/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAtsApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      body?: string;
      candidIds?: string[];
      senderEmail?: string;
      subject?: string;
    };

    const subject = String(body.subject ?? "").trim();
    const content = String(body.body ?? "").trim();
    const candidIds = Array.isArray(body.candidIds)
      ? body.candidIds.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];

    if (!subject || !content || candidIds.length === 0) {
      return NextResponse.json(
        { error: "subject, body, and candidIds are required" },
        { status: 400 }
      );
    }

    const result = await sendBulkAtsManualEmails({
      body: content,
      candidIds,
      subject,
      userEmail: String(body.senderEmail ?? user.email ?? "").trim(),
      userId: user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to send bulk outreach");
  }
}
