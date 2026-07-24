import type { User } from "@supabase/supabase-js";
import { IncomingWebhook } from "@slack/webhook";

export type SlackActivityDetail = {
  label: string;
  value?: string | number | boolean | null;
};

type NotifySlackActivityArgs = {
  action: string;
  channelId?: string | null;
  details?: SlackActivityDetail[];
  email?: string | null;
  name?: string | null;
  nameUrl?: string | null;
  user?: User | null;
  userId?: string | null;
};

const getActivityWebhookUrl = () =>
  process.env.SLACK_ACTIVITY_WEBHOOK_URL?.trim() ||
  process.env.SLACK_TOKEN?.trim() ||
  "";

const COMPACT_ACTIVITY_ACTIONS = new Set([
  "회원가입 완료",
  "/career/onboarding 제출 완료",
]);

const normalizeText = (value: unknown) => String(value ?? "").trim();

const escapeSlackText = (value: unknown) =>
  normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapeSlackLinkUrl = (value: unknown) =>
  normalizeText(value)
    .replace(/\s/g, "%20")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\|/g, "%7C");

const formatSlackLink = (url: unknown, text: unknown) => {
  const normalizedText = normalizeText(text);
  const safeUrl = escapeSlackLinkUrl(url);
  if (!safeUrl || !normalizedText) return escapeSlackText(normalizedText);
  return `<${safeUrl}|${escapeSlackText(normalizedText)}>`;
};

export const getSlackActivityUserName = (user: User | null | undefined) =>
  normalizeText(user?.user_metadata?.full_name) ||
  normalizeText(user?.user_metadata?.name) ||
  normalizeText(user?.email).split("@")[0] ||
  "Unknown";

export function getSlackActivityDeviceLabel(req: {
  headers: { get(name: string): string | null };
}) {
  const mobileClientHint = req.headers.get("sec-ch-ua-mobile")?.trim();
  if (mobileClientHint === "?1" || mobileClientHint === "1") return "모바일";
  if (mobileClientHint === "?0" || mobileClientHint === "0") return "데스크탑";

  const userAgent = req.headers.get("user-agent") ?? "";
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    userAgent
  )
    ? "모바일"
    : "데스크탑";
}

function getSlackActivityDetailValue(
  details: SlackActivityDetail[] | undefined,
  label: string
) {
  const targetLabel = label.toLowerCase();
  return normalizeText(
    details?.find((detail) => detail.label.toLowerCase() === targetLabel)?.value
  );
}

function buildSlackActivityLines(
  args: NotifySlackActivityArgs & {
    email: string;
    name: string;
    userId: string;
  }
) {
  const action = escapeSlackText(args.action) || "Unknown";

  if (COMPACT_ACTIVITY_ACTIONS.has(args.action)) {
    const device = getSlackActivityDetailValue(args.details, "Device");
    const name = formatSlackLink(args.nameUrl, args.name);
    const identity = [
      name,
      escapeSlackText(args.email),
      escapeSlackText(device),
    ]
      .filter(Boolean)
      .join(", ");
    const detailLines = (args.details ?? []).flatMap((detail) => {
      if (detail.label.toLowerCase() === "device") return [];
      const value = normalizeText(detail.value);
      if (!value) return [];
      return [
        `- *${escapeSlackText(detail.label)}*: ${escapeSlackText(value)}`,
      ];
    });

    return [
      `- *Action*: ${action}`,
      `- ${identity || escapeSlackText(args.userId) || "Unknown"}`,
      ...detailLines,
    ];
  }

  const lines = [
    `- *Action*: ${action}`,
    `- *Name*: ${formatSlackLink(args.nameUrl, args.name) || "Unknown"}`,
    `- *Email*: ${escapeSlackText(args.email) || "Unknown"}`,
  ];

  for (const detail of args.details ?? []) {
    const value = normalizeText(detail.value);
    if (!value) continue;
    lines.push(
      `- *${escapeSlackText(detail.label)}*: ${escapeSlackText(value)}`
    );
  }

  return lines;
}

export async function notifySlackActivity(args: NotifySlackActivityArgs) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return false;

  const name = normalizeText(args.name) || getSlackActivityUserName(args.user);
  const email = normalizeText(args.email) || normalizeText(args.user?.email);
  const userId = normalizeText(args.userId) || normalizeText(args.user?.id);
  const lines = buildSlackActivityLines({
    ...args,
    email,
    name,
    userId,
  });
  const payload = {
    text: `Harper activity: ${args.action} - ${email || name || userId || "unknown"}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n"),
        },
      },
    ],
  };
  const channelId = normalizeText(args.channelId);

  if (channelId) {
    const token = process.env.SLACK_BOT_TOKEN?.trim();
    if (!token) {
      console.warn("[slackActivity] SLACK_BOT_TOKEN missing");
      return false;
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      body: JSON.stringify({ channel: channelId, ...payload }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      method: "POST",
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      ok?: boolean;
    } | null;

    if (!response.ok || !result?.ok) {
      throw new Error(
        `Slack chat.postMessage failed: ${result?.error ?? response.status}`
      );
    }
    return true;
  }

  const webhookUrl = getActivityWebhookUrl();
  if (!webhookUrl) {
    console.warn(
      "[slackActivity] SLACK_ACTIVITY_WEBHOOK_URL/SLACK_TOKEN missing"
    );
    return false;
  }

  const webhook = new IncomingWebhook(webhookUrl);
  await webhook.send(payload);

  return true;
}
