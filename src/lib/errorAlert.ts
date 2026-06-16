import { IncomingWebhook } from "@slack/webhook";

type ErrorAlertArgs = {
  conversationId?: string | null;
  error: unknown;
  metadata?: Record<string, unknown>;
  route: string;
  stage: string;
  title?: string;
  userId?: string | null;
};

const UNSUPPORTED_UNICODE_ESCAPE_RE =
  /unsupported Unicode escape sequence|\\u0000|u0000|U\+0000|cannot be converted to text/i;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return String(error ?? "Unknown error");
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 15)).trimEnd()}...(truncated)`;
}

function escapeSlackText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMetadata(metadata: ErrorAlertArgs["metadata"]) {
  return Object.entries(metadata ?? {}).flatMap(([key, value]) => {
    if (value === undefined) return [];
    const normalized = truncate(String(value ?? "null"), 300);
    return `- *${escapeSlackText(key)}*: ${escapeSlackText(normalized)}`;
  });
}

export function isUnsupportedUnicodeEscapeError(error: unknown) {
  return UNSUPPORTED_UNICODE_ESCAPE_RE.test(getErrorMessage(error));
}

export async function notifyErrorAlert(args: ErrorAlertArgs) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return false;

  const webhookUrl = process.env.SLACK_INTERNAL_NOTI_TOKEN?.trim();
  if (!webhookUrl) {
    console.warn("[error-alert] SLACK_INTERNAL_NOTI_TOKEN missing");
    return false;
  }

  const title = args.title?.trim() || "Harper error alert";
  const errorMessage = truncate(getErrorMessage(args.error), 1200);
  const lines = [
    `*${escapeSlackText(title)}*`,
    `- *Route*: ${escapeSlackText(args.route)}`,
    `- *Stage*: ${escapeSlackText(args.stage)}`,
    args.userId ? `- *User*: ${escapeSlackText(args.userId)}` : null,
    args.conversationId
      ? `- *Conversation*: ${escapeSlackText(args.conversationId)}`
      : null,
    `- *Error*: ${escapeSlackText(errorMessage)}`,
    ...formatMetadata(args.metadata),
  ].filter((line): line is string => Boolean(line));

  try {
    const webhook = new IncomingWebhook(webhookUrl);
    await webhook.send({
      text: `${title} - ${args.route} ${args.stage}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: truncate(lines.join("\n"), 2900),
          },
        },
      ],
    });
    return true;
  } catch (error) {
    console.error("[error-alert] Slack notify failed", {
      error: getErrorMessage(error),
      originalError: errorMessage,
      route: args.route,
      stage: args.stage,
    });
    return false;
  }
}

export async function notifyUnsupportedUnicodeEscapeError(args: ErrorAlertArgs) {
  if (!isUnsupportedUnicodeEscapeError(args.error)) return false;
  return notifyErrorAlert({
    ...args,
    title: args.title ?? "Unsupported Unicode escape sequence",
  });
}
