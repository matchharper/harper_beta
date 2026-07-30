import { IncomingWebhook } from "@slack/webhook";
import type { NextRequest } from "next/server";
import {
  type CrispFeedbackMessage,
  type CrispFeedbackPayload,
  getRequesterFromPayload,
  normalizeCrispText,
} from "@/lib/feedback/crisp";
import { sendResendEmail } from "@/lib/email/send";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";

function getInternalSlackWebhook() {
  const webhookUrl = process.env.SLACK_INTERNAL_NOTI_TOKEN?.trim();
  if (!webhookUrl) {
    throw new Error("SLACK_INTERNAL_NOTI_TOKEN is required");
  }

  return new IncomingWebhook(webhookUrl);
}

export function getRequestOrigin(req: NextRequest) {
  return getPublicSiteUrlFromRequest(req);
}

function getKstTimestamp() {
  return new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateSlackText(value: string, maxLength = 2800) {
  const text = normalizeCrispText(value, maxLength + 1);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function buildReplyEmailSubject(message?: string | null) {
  const normalized = normalizeCrispText(message, 5000).replace(/\s+/g, " ");
  const snippet = normalized.slice(0, 20) || "문의";
  const suffix = normalized.length > 20 ? "..." : "";
  return `Harper Re: "${snippet}${suffix}"`;
}

export async function notifyCrispFeedbackSlack({
  authenticated,
  feedbackId,
  message,
  payload,
  req,
}: {
  authenticated: boolean;
  feedbackId: number;
  message: CrispFeedbackMessage;
  payload: CrispFeedbackPayload;
  req: NextRequest;
}) {
  const requester = getRequesterFromPayload(payload);
  const replyUrl = `${getRequestOrigin(req)}/ops/feedback?feedbackId=${feedbackId}`;
  const userType = authenticated ? "로그인 유저" : "비로그인 유저";
  const name = requester.name || "(이름 미입력)";
  const email = requester.email || "(이메일 미입력)";
  const content = truncateSlackText(message.text);

  const text = [
    `Harper 문의 #${feedbackId}`,
    `Type: ${userType}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `Page: ${payload.pagePath}`,
    `Time(Standard Korea Time): ${getKstTimestamp()}`,
    "",
    content,
    "",
    `답장하기: ${replyUrl}`,
  ].join("\n");

  await getInternalSlackWebhook().send({
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*Harper 문의 #${feedbackId}*`,
            `• *Type*: ${userType}`,
            `• *Name*: ${name}`,
            `• *Email*: ${email}`,
            `• *Page*: ${payload.pagePath}`,
            `• *Time(Standard Korea Time)*: ${getKstTimestamp()}`,
            "",
            `*Content*`,
            content,
          ].join("\n"),
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "답장하기",
            },
            url: replyUrl,
          },
        ],
      },
    ],
  });
}

export async function sendCrispFeedbackReplyEmail({
  feedbackId,
  operatorEmail,
  operatorName,
  payload,
  replyText,
}: {
  feedbackId: number;
  operatorEmail: string;
  operatorName?: string | null;
  payload: CrispFeedbackPayload;
  replyText: string;
}) {
  const requester = getRequesterFromPayload(payload);
  if (payload.wantsEmailReply !== true || !requester.email) {
    return { sent: false as const, skipped: true as const };
  }

  const latestUserMessage = [...payload.messages]
    .reverse()
    .find((message) => message.role === "user" && !message.deletedAt)?.text;
  const senderLabel = operatorName?.trim() || operatorEmail;
  const subject = buildReplyEmailSubject(latestUserMessage);
  const text = [
    `Harper 답변입니다.`,
    "",
    replyText,
    "",
    latestUserMessage ? "문의 내용:" : "",
    latestUserMessage ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const html = [
    `<p>Harper 답변입니다.</p>`,
    `<p>${escapeHtml(replyText).replace(/\n/g, "<br />")}</p>`,
    latestUserMessage
      ? `<hr /><p style="color:#666;font-size:13px;">문의 내용</p><p style="color:#333;font-size:13px;">${escapeHtml(
          latestUserMessage
        ).replace(/\n/g, "<br />")}</p>`
      : "",
  ].join("");

  const result = await sendResendEmail({
    from: operatorEmail,
    html,
    idempotencyKey: `crisp-feedback-${feedbackId}-${payload.messages.length}`,
    replyTo: operatorEmail,
    subject,
    text,
    to: requester.email,
  });

  return { result, sent: true as const, skipped: false as const };
}
