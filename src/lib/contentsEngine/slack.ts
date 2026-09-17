type OutreachReplyNotification = {
  activityId: string;
  activityRef: number | string;
  body: string;
  creatorName: string;
  creatorRef: number | string;
  dispatchRef: number | string;
  fromEmail: string;
  receivedAt: string;
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

export async function notifyGtmOutreachReply(
  reply: OutreachReplyNotification
) {
  const token = requiredEnv("SLACK_BOT_TOKEN");
  const channel = requiredEnv("GTM_OUTREACH_SLACK_CHANNEL_ID");
  const sheetUrl =
    process.env.GTM_CONTENTS_ENGINE_SHEET_URL?.trim() ||
    "https://docs.google.com/spreadsheets/d/1-3QpEN19fFEiP6acBqLWMCOD483bWvJtPwwQ9KUqgEI/edit";
  const preview = reply.body.trim().slice(0, 1200) || "(본문 없음)";
  const text = `${reply.creatorName} 크리에이터에게 이메일 답장이 왔습니다.`;
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Creator outreach reply",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              `*Creator:* #${escapeSlack(reply.creatorRef)} ${escapeSlack(reply.creatorName)}`,
              `*From:* ${escapeSlack(reply.fromEmail)}`,
              `*Subject:* ${escapeSlack(reply.subject || "(제목 없음)")}`,
              `*Received:* ${escapeSlack(reply.receivedAt)}`,
              `*Dispatch:* #${escapeSlack(reply.dispatchRef)} · Outreach Log #${escapeSlack(reply.activityRef)}`,
              "",
              escapeSlack(preview),
              "",
              `<${sheetUrl}|Open Contents Engine Sheet>`,
            ].join("\n"),
          },
        },
      ],
      channel,
      client_msg_id: reply.activityId,
      text,
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
