import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendInternalEmail } from "@/lib/internalMail";
import { sendCandidateMailAndLog } from "@/lib/opsNetworkServer";

export const runtime = "nodejs";

type Body = {
  content?: string;
  fromEmail?: string;
  id?: number;
  subject?: string;
};

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const leadId = Number(body.id ?? "");
    const fromEmail = String(body.fromEmail ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const content = String(body.content ?? "").trim();

    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
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

    const entry = await sendCandidateMailAndLog({
      content,
      createdBy: user.email ?? "unknown@matchharper.com",
      fromEmail,
      leadId,
      sendEmail: sendInternalEmail,
      subject,
    });

    return NextResponse.json({ entry, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to send candidate email");
  }
}
