import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  appendHarperEmailFooterText,
  renderEmailBodyHtmlWithHarperFooter,
} from "@/lib/email/harperFooter";
import { sendInternalEmail } from "@/lib/internalMail";
import { fetchCareerTalentMailRecipient } from "@/lib/opsCareerServer";

export const runtime = "nodejs";

type Body = {
  content?: string;
  fromEmail?: string;
  subject?: string;
  userId?: string;
};

function isValidEmail(value: string) {
  const normalized = value.trim();
  return (
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(normalized) ||
    /^.{1,80}<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/.test(normalized)
  );
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const userId = String(body.userId ?? "").trim();
    const fromEmail = String(body.fromEmail ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const content = String(body.content ?? "").trim();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
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

    const recipient = await fetchCareerTalentMailRecipient(userId);

    await sendInternalEmail({
      from: fromEmail,
      html: renderEmailBodyHtmlWithHarperFooter(content),
      subject,
      text: appendHarperEmailFooterText(content),
      to: recipient.email,
    });

    return NextResponse.json({
      ok: true,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to send career talent email");
  }
}
