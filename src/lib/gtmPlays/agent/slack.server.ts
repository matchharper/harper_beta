import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

/** #gtm-talent (Shaun 11/18): the #5 daily numbers and every candidate reply go there. */
export const GTM_TALENT_CHANNEL_ID = "C0A795ULXGF";

export type SlackPost = { ok: true; ts: string | null } | { ok: false; status: number; error: string };

/**
 * One message in #gtm-talent as the Harper Slack app (SLACK_BOT_TOKEN), link previews off. With `blocks`, Slack shows
 * the blocks and `text` is the notification line. With `threadTs`, it is a reply under that message.
 */
export async function postToGtmTalent(
  text: string, blocks?: readonly Record<string, unknown>[], options: { threadTs?: string | null } = {},
): Promise<SlackPost> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return { ok: false, status: 500, error: "SLACK_BOT_TOKEN is required" };
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      channel: GTM_TALENT_CHANNEL_ID, text, ...(blocks?.length ? { blocks } : {}), ...(options.threadTs ? { thread_ts: options.threadTs } : {}),
      unfurl_links: false, unfurl_media: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; ts?: string } | null;
  if (!response.ok || !result?.ok) return { ok: false, status: 502, error: result?.error ?? `slack ${response.status}` };
  return { ok: true, ts: typeof result.ts === "string" ? result.ts : null };
}

/**
 * The daily numbers post (agent/dailyReport.ts) is kept in `logs` (no user), so a candidate's reply goes under the
 * latest one as a comment (Shaun 11/19).
 */
const DAILY_REPORT_LOG = "gtm_agent_daily_report";

export async function rememberDailyReport(ts: string, period: { from: string; to: string }) {
  const { error } = await getSupabaseAdmin().from("logs").insert({
    type: DAILY_REPORT_LOG, user_id: null, meta_data: { channel: GTM_TALENT_CHANNEL_ID, ts, ...period },
  });
  if (error) throw error;
}

/** The latest daily numbers post in #gtm-talent, null before the first one. */
export async function latestDailyReportTs(): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from("logs").select("meta_data")
    .eq("type", DAILY_REPORT_LOG).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const meta = (data?.meta_data ?? null) as { channel?: unknown; ts?: unknown } | null;
  return meta?.channel === GTM_TALENT_CHANNEL_ID && typeof meta.ts === "string" && /^\d+\.\d+$/.test(meta.ts) ? meta.ts : null;
}
