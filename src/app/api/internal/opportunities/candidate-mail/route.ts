import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendInternalEmail } from "@/lib/internalMail";
import { fetchOpsOpportunityCandidateContact } from "@/lib/opsOpportunity";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

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
    const user = await requireInternalApiUser(req);
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

    const sendResult = await sendInternalEmail({
      from: fromEmail,
      subject,
      text: content,
      to: recipient.email,
    });
    const resendEmailId =
      sendResult && typeof sendResult === "object" && "id" in sendResult
        ? String((sendResult as { id?: unknown }).id ?? "")
        : "";

    const { error: historyError } = await (getTalentSupabaseAdmin() as any)
      .from("career_email_messages")
      .insert({
        body_text: content,
        created_by: user.email ?? "internal",
        direction: "outbound",
        from_email: fromEmail,
        mail_type: "manual_ops",
        metadata: {
          resendEmailId: resendEmailId || null,
          source: "internal_opportunity_candidate_mail",
        },
        status: "sent",
        subject,
        talent_id: talentId,
        to_email: recipient.email,
      });
    if (historyError) {
      console.warn("[opportunity-candidate-mail] email history insert skipped", {
        error: historyError.message,
        talentId,
      });
    }

    return NextResponse.json({
      ok: true,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to send candidate email");
  }
}
