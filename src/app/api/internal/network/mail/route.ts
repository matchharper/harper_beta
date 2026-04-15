import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendInternalEmail } from "@/lib/internalMail";
import {
  fetchNetworkLeadById,
  sendCandidateMailAndLog,
} from "@/lib/opsNetworkServer";
import {
  buildTalentNetworkInviteToken,
  buildTalentNetworkInviteUrl,
} from "@/lib/talentNetworkInvite";
import { renderOpsNetworkMailTemplate } from "@/lib/opsNetworkMailTemplate";

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

function getSiteUrlFromRequest(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;

  return `${proto}://${host}`.replace(/\/+$/, "");
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
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );
    }
    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const lead = await fetchNetworkLeadById(leadId);
    const recipientMail = String(lead.email ?? "").trim();
    const normalizedEmail = recipientMail.toLowerCase();
    const inviteUrl =
      normalizedEmail.length > 0
        ? buildTalentNetworkInviteUrl({
            baseUrl: getSiteUrlFromRequest(req),
            token: buildTalentNetworkInviteToken({
              email: normalizedEmail,
              waitlistId: leadId,
            }),
          })
        : null;
    const contentIncludesInviteUrlPlaceholder = /\{\{\s*invite_url\s*\}\}/i.test(
      content
    );
    const renderedSubject = renderOpsNetworkMailTemplate(subject, {
      inviteUrl,
      mail: recipientMail || lead.email,
      name: lead.name,
    });
    const renderedContent = renderOpsNetworkMailTemplate(content, {
      inviteUrl,
      mail: recipientMail || lead.email,
      name: lead.name,
    });
    const finalContent = inviteUrl
      ? contentIncludesInviteUrlPlaceholder
        ? renderedContent
        : `${renderedContent.trim()}\n\n\n지원 정보를 확인하려면 아래 링크로 들어와 로그인해 주세요.\n${inviteUrl}\n\n<span style="font-size: 12px; color: #666;">If you would like to change how often Harper emails you or stop receiving emails from it entirely, just let us know via email.</span>`
      : renderedContent;

    const entry = await sendCandidateMailAndLog({
      content: finalContent,
      createdBy: user.email ?? "unknown@matchharper.com",
      fromEmail,
      leadId,
      sendEmail: sendInternalEmail,
      subject: renderedSubject,
    });

    return NextResponse.json({ entry, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to send candidate email");
  }
}
