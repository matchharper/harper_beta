import type { User } from "@supabase/supabase-js";
import { IncomingWebhook } from "@slack/webhook";

type SlackActivityDetail = {
  label: string;
  value?: string | number | boolean | null;
};

type NotifySlackActivityArgs = {
  action: string;
  details?: SlackActivityDetail[];
  email?: string | null;
  name?: string | null;
  user?: User | null;
  userId?: string | null;
};

const getActivityWebhookUrl = () =>
  process.env.SLACK_ACTIVITY_WEBHOOK_URL?.trim() ||
  process.env.SLACK_TOKEN?.trim() ||
  "";

const normalizeText = (value: unknown) => String(value ?? "").trim();

const escapeSlackText = (value: unknown) =>
  normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const getSlackActivityUserName = (user: User | null | undefined) =>
  normalizeText(user?.user_metadata?.full_name) ||
  normalizeText(user?.user_metadata?.name) ||
  normalizeText(user?.email).split("@")[0] ||
  "Unknown";

export async function notifySlackActivity(args: NotifySlackActivityArgs) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return false;

  const webhookUrl = getActivityWebhookUrl();
  if (!webhookUrl) {
    console.warn("[slackActivity] SLACK_ACTIVITY_WEBHOOK_URL/SLACK_TOKEN missing");
    return false;
  }

  const name = normalizeText(args.name) || getSlackActivityUserName(args.user);
  const email = normalizeText(args.email) || normalizeText(args.user?.email);
  const userId = normalizeText(args.userId) || normalizeText(args.user?.id);

  const lines = [
    "*Harper activity*",
    `- *Action*: ${escapeSlackText(args.action) || "Unknown"}`,
    `- *Name*: ${escapeSlackText(name) || "Unknown"}`,
    `- *Email*: ${escapeSlackText(email) || "Unknown"}`,
  ];

  for (const detail of args.details ?? []) {
    const value = normalizeText(detail.value);
    if (!value) continue;
    lines.push(`- *${escapeSlackText(detail.label)}*: ${escapeSlackText(value)}`);
  }

  const webhook = new IncomingWebhook(webhookUrl);
  await webhook.send({
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
  });

  return true;
}
