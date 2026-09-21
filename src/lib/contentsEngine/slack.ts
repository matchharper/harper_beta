import type { OutreachReplyTriageType } from "@/lib/contentsEngine/replyTriage";
import { stripQuotedEmailText } from "@/lib/email/parse";
import { buildGtmCreatorWorkspaceUrl } from "@/lib/gtm/url";

type OutreachReplyNotification = {
  activityId: string;
  activityRef: number | string;
  body: string;
  creatorName: string;
  creatorId?: string;
  creatorRef: number | string;
  dispatchRef: number | string;
  fromEmail: string;
  outboundSentAt: string | null;
  outboundSubject: string;
  primaryHandle?: string | null;
  receivedAt: string;
  subject: string;
  triageSummary: string;
  triageType: OutreachReplyTriageType;
};

type OutreachDeliveryFailureNotification = {
  activityId: string;
  creatorId?: string;
  creatorName: string;
  creatorRef: number | string;
  diagnosticCode?: string | null;
  dispatchRef: number | string;
  permanent: boolean;
  recipientEmail: string;
  status?: string | null;
  subject: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function escapeSlack(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeSlackLinkLabel(value: unknown) {
  return escapeSlack(value).replace(/\|/g, "&#124;");
}

function slackDate(value: string | null | undefined) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "확인 불가";
  const fallback = new Date(timestamp).toISOString();
  return `<!date^${Math.floor(timestamp / 1000)}^{date_short_pretty} {time}|${fallback}>`;
}

function slackQuote(value: string) {
  return escapeSlack(value)
    .split("\n")
    .map((line) => `> ${line || " "}`)
    .join("\n");
}

const TRIAGE_PRESENTATION: Record<
  OutreachReplyTriageType,
  { emoji: string; label: string }
> = {
  positive: { emoji: "🟢", label: "긍정" },
  negotiation: { emoji: "🟡", label: "협상" },
  question: { emoji: "🔵", label: "추가 질문" },
  negative: { emoji: "🔴", label: "부정" },
  published: { emoji: "🟣", label: "게시 알림" },
  other: { emoji: "⚪", label: "기타" },
  unclassified: { emoji: "⚪", label: "미분류" },
};

export function buildGtmOutreachReplySlackMessage(
  reply: OutreachReplyNotification,
  workspaceUrl: string
) {
  const presentation = TRIAGE_PRESENTATION[reply.triageType];
  const preview =
    stripQuotedEmailText(reply.body).trim().slice(0, 1200) || "(본문 없음)";
  const creatorName = reply.creatorId
    ? `<${workspaceUrl}|${escapeSlackLinkLabel(reply.creatorName)}>`
    : escapeSlack(reply.creatorName);
  const creatorIdentity = [
    `#${reply.creatorRef}`,
    creatorName,
    reply.primaryHandle
      ? `@${String(reply.primaryHandle).replace(/^@/, "")}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const header = `${presentation.emoji} ${presentation.label} · ${reply.creatorName}`;
  const text = `${presentation.emoji} ${reply.creatorName} 크리에이터 답장: ${reply.triageSummary}`;
  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: header.slice(0, 150) },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*답장 내용*\n${slackQuote(preview)}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*요약* ${escapeSlack(reply.triageSummary)}`,
            `*대상* ${creatorIdentity} · 발송 #${escapeSlack(reply.dispatchRef)} · ${escapeSlack(reply.outboundSubject || "(발송 제목 없음)")}`,
            `*문의 발송* ${slackDate(reply.outboundSentAt)}`,
            `*회신 수신* ${slackDate(reply.receivedAt)} · ${escapeSlack(reply.fromEmail)} · ${escapeSlack(reply.subject || "(제목 없음)")}`,
            `<${workspaceUrl}|GTM에서 대화 보기>`,
          ].join("\n"),
        },
      },
    ],
    text,
  };
}

export async function notifyGtmOutreachReply(reply: OutreachReplyNotification) {
  const token = requiredEnv("SLACK_BOT_TOKEN");
  const channel = requiredEnv("GTM_OUTREACH_SLACK_CHANNEL_ID");
  const workspaceUrl = reply.creatorId
    ? buildGtmCreatorWorkspaceUrl({
        baseUrl:
          process.env.GTM_WORKSPACE_URL?.trim() ||
          "https://matchharper.com/ops/gtm",
        creatorId: reply.creatorId,
      })
    : process.env.GTM_WORKSPACE_URL?.trim() ||
      "https://matchharper.com/ops/gtm";
  const message = buildGtmOutreachReplySlackMessage(reply, workspaceUrl);
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      blocks: message.blocks,
      channel,
      client_msg_id: reply.activityId,
      text: message.text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
    ts?: string;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(
      `Slack reply notification failed: ${payload.error ?? response.status}`
    );
  }
  return { channel, ts: payload.ts ?? null };
}

export function buildGtmOutreachDeliveryFailureSlackMessage(
  failure: OutreachDeliveryFailureNotification,
  workspaceUrl: string
) {
  const marker =
    failure.status === "email.complained"
      ? "🔴 스팸 신고"
      : failure.status === "email.failed"
        ? "🔴 발송 실패"
        : failure.permanent
          ? "🔴 영구 반송"
          : "🟠 일시적 전달 오류";
  const diagnostic =
    failure.diagnosticCode?.replace(/\s+/g, " ").trim().slice(0, 320) ||
    "메일 제공업체가 상세 원인을 제공하지 않았습니다.";
  const creatorName = failure.creatorId
    ? `<${workspaceUrl}|${escapeSlackLinkLabel(failure.creatorName)}>`
    : escapeSlack(failure.creatorName);
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${marker} · ${failure.creatorName}`.slice(0, 150),
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*대상* #${escapeSlack(failure.creatorRef)} · ${creatorName} · 발송 #${escapeSlack(failure.dispatchRef)}`,
            `*주소* ${escapeSlack(failure.recipientEmail)} · 상태 ${escapeSlack(failure.status || "확인 필요")}`,
            `*메일* ${escapeSlack(failure.subject || "(제목 없음)")}`,
            `> ${escapeSlack(diagnostic)}`,
            `<${workspaceUrl}|GTM에서 확인>`,
          ].join("\n"),
        },
      },
    ],
    text: `${marker}: ${failure.creatorName} · ${failure.recipientEmail}`,
  };
}

export async function notifyGtmOutreachDeliveryFailure(
  failure: OutreachDeliveryFailureNotification
) {
  const token = requiredEnv("SLACK_BOT_TOKEN");
  const channel = requiredEnv("GTM_OUTREACH_SLACK_CHANNEL_ID");
  const workspaceUrl = failure.creatorId
    ? buildGtmCreatorWorkspaceUrl({
        baseUrl:
          process.env.GTM_WORKSPACE_URL?.trim() ||
          "https://matchharper.com/ops/gtm",
        creatorId: failure.creatorId,
      })
    : process.env.GTM_WORKSPACE_URL?.trim() ||
      "https://matchharper.com/ops/gtm";
  const message = buildGtmOutreachDeliveryFailureSlackMessage(
    failure,
    workspaceUrl
  );
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      blocks: message.blocks,
      channel,
      client_msg_id: failure.activityId,
      text: message.text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
    ts?: string;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(
      `Slack delivery failure notification failed: ${payload.error ?? response.status}`
    );
  }
  return { channel, ts: payload.ts ?? null };
}
