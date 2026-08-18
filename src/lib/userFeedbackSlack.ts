/**
 * User-authored feedback, inquiries, and customer-support messages always go
 * to this channel. Keep the destination in code so it cannot drift per
 * deployment environment; the bot token remains secret configuration.
 */
export const USER_FEEDBACK_SLACK_CHANNEL_ID = "C0BQWKFD058";

type SlackBlock = Record<string, unknown>;

type UserFeedbackSlackMessage = {
  blocks?: SlackBlock[];
  text: string;
};

export async function postUserFeedbackSlackMessage(
  message: UserFeedbackSlackMessage
) {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is required");
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    body: JSON.stringify({
      channel: USER_FEEDBACK_SLACK_CHANNEL_ID,
      ...message,
    }),
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
}
