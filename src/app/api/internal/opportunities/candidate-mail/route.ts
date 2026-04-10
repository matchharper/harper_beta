import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendInternalEmail } from "@/lib/internalMail";
import { fetchOpsOpportunityCandidateContact } from "@/lib/opsOpportunity";

export const runtime = "nodejs";

type Body = {
  content?: string;
  fromEmail?: string;
  subject?: string;
  talentId?: string;
};

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const talentId = String(body.talentId ?? "").trim();
    const fromEmail = String(body.fromEmail ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const content = String(body.content ?? "").trim();

    if (!talentId) {
      return NextResponse.json({ error: "talentId is required" }, { status: 400 });
    }
    if (!isValidEmail(fromEmail)) {
      return NextResponse.json(
        { error: "A valid sender email is required" },
        { status: 400 }
      );
    }
    if (!subject) {
      return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const recipient = await fetchOpsOpportunityCandidateContact({ talentId });

    await sendInternalEmail({
      from: fromEmail,
      subject,
      text: content,
      to: recipient.email,
    });

    return NextResponse.json({
      ok: true,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to send candidate email");
  }
}
