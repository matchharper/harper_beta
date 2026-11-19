import "server-only";

/** #gtm-talent (Shaun 11/18): the #5 daily numbers and every candidate reply go there. */
export const GTM_TALENT_CHANNEL_ID = "C0A795ULXGF";

export type SlackPost = { ok: true } | { ok: false; status: number; error: string };

/**
 * One message in #gtm-talent as the Harper Slack app (SLACK_BOT_TOKEN), link previews off. With `blocks`, Slack shows
 * the blocks and `text` is the notification line.
 */
export async function postToGtmTalent(text: string, blocks?: readonly Record<string, unknown>[]): Promise<SlackPost> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return { ok: false, status: 500, error: "SLACK_BOT_TOKEN is required" };
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      channel: GTM_TALENT_CHANNEL_ID, text, ...(blocks?.length ? { blocks } : {}), unfurl_links: false, unfurl_media: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !result?.ok) return { ok: false, status: 502, error: result?.error ?? `slack ${response.status}` };
  return { ok: true };
}
