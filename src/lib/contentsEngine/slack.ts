import type { OutreachReplyTriageType } from "@/lib/contentsEngine/replyTriage";

type OutreachReplyNotification = {
  activityId: string;
  activityRef: number | string;
  body: string;
  creatorName: string;
  creatorRef: number | string;
  dispatchRef: number | string;
  fromEmail: string;
  outboundSubject: string;
  primaryHandle?: string | null;
  receivedAt: string;
  subject: string;
  triageSummary: string;
  triageType: OutreachReplyTriageType;
};

type OutreachDeliveryFailureNotification = {
  activityId: string;
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
  sheetUrl: string
) {
  const presentation = TRIAGE_PRESENTATION[reply.triageType];
  const preview = reply.body.replace(/\s+/g, " ").trim().slice(0, 320) || "(본문 없음)";
  const creatorIdentity = [
    `#${reply.creatorRef}`,
    reply.creatorName,
    reply.primaryHandle ? `@${String(reply.primaryHandle).replace(/^@/, "")}` : "",
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
          text: [
            `*요약* ${escapeSlack(reply.triageSummary)}`,
            `*대상* ${escapeSlack(creatorIdentity)} · 발송 #${escapeSlack(reply.dispatchRef)} · ${escapeSlack(reply.outboundSubject || "(발송 제목 없음)")}`,
            `*회신* ${escapeSlack(reply.fromEmail)} · ${escapeSlack(reply.subject || "(제목 없음)")}`,
            `> ${escapeSlack(preview)}`,
            `<${sheetUrl}|Contents Engine에서 원문 보기>`,
          ].join("\n"),
        },
      },
    ],
    text,
  };
}

export async function notifyGtmOutreachReply(
  reply: OutreachReplyNotification
) {
  const token = requiredEnv("SLACK_BOT_TOKEN");
  const channel = requiredEnv("GTM_OUTREACH_SLACK_CHANNEL_ID");
  const sheetUrl =
    process.env.GTM_CONTENTS_ENGINE_SHEET_URL?.trim() ||
    "https://docs.google.com/spreadsheets/d/1-3QpEN19fFEiP6acBqLWMCOD483bWvJtPwwQ9KUqgEI/edit";
  const message = buildGtmOutreachReplySlackMessage(reply, sheetUrl);
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
  sheetUrl: string
) {
  const marker = failure.permanent ? "🔴 영구 반송" : "🟠 일시적 전달 오류";
  const diagnostic =
    failure.diagnosticCode?.replace(/\s+/g, " ").trim().slice(0, 320) ||
    "Gmail이 상세 원인을 제공하지 않았습니다.";
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
            `*대상* #${escapeSlack(failure.creatorRef)} · ${escapeSlack(failure.creatorName)} · 발송 #${escapeSlack(failure.dispatchRef)}`,
            `*주소* ${escapeSlack(failure.recipientEmail)} · 상태 ${escapeSlack(failure.status || "확인 필요")}`,
            `*메일* ${escapeSlack(failure.subject || "(제목 없음)")}`,
            `> ${escapeSlack(diagnostic)}`,
            `<${sheetUrl}|Contents Engine에서 확인>`,
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
  const sheetUrl =
    process.env.GTM_CONTENTS_ENGINE_SHEET_URL?.trim() ||
    "https://docs.google.com/spreadsheets/d/1-3QpEN19fFEiP6acBqLWMCOD483bWvJtPwwQ9KUqgEI/edit";
  const message = buildGtmOutreachDeliveryFailureSlackMessage(
    failure,
    sheetUrl
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
