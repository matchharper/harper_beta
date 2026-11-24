import "server-only";

import { gtmWrite } from "../db.server";
import { GTM_HARPER_ORIGIN } from "../shared";
import { ALERT_EVERY_MS, alertText, alertWebhook, type AgentAlertKind } from "./alerts";
import { postToGtmTalent } from "./slack.server";

/**
 * Sends one #5 alert to Slack (agent/alerts.ts), at most once per kind in its interval (kept on
 * gtm_agent_settings.alerts_sent, so several ticks never send the same one): to GTM_AGENT_ALERT_WEBHOOK when it is
 * set, else as the Harper Slack app to #gtm-talent, the way the daily numbers and reply alerts go (11/24, incident
 * #134: the webhook was never set in production, so no brake or error alert had ever been sent). Never throws and
 * never holds a tick up for more than a few seconds. Returns whether it was sent.
 */
export async function agentAlert(
  kind: AgentAlertKind, detail: string, options: { key?: string; mentionUserId?: string | null } = {},
): Promise<boolean> {
  const webhook = alertWebhook(process.env);
  if (!webhook && !process.env.SLACK_BOT_TOKEN?.trim()) return false;
  // The interval is per key: one kind about several things (a channel each) sends once for each.
  const key = options.key ? `${kind}:${options.key}` : kind;
  try {
    const taken = await gtmWrite((sql) => sql<Array<{ id: boolean }>>`
      update public.gtm_agent_settings
      set alerts_sent = coalesce(alerts_sent, '{}'::jsonb) || jsonb_build_object(${key}::text, now())
      where id and (
        alerts_sent ->> ${key}::text is null
        or (alerts_sent ->> ${key}::text)::timestamptz < now() - make_interval(secs => ${Math.round(ALERT_EVERY_MS[kind] / 1000)}::int))
      returning id
    `);
    if (!taken.length) return false;
    const text = alertText(kind, detail, `${GTM_HARPER_ORIGIN}/ops/gtm-plays`, options.mentionUserId ?? null);
    if (!webhook) {
      const posted = await postToGtmTalent(text);
      if (!posted.ok) console.warn("[gtm-agent] alert not sent", kind, posted.status, posted.error);
      return posted.ok;
    }
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.warn("[gtm-agent] alert not sent", kind, response.status);
    return response.ok;
  } catch (error) {
    console.warn("[gtm-agent] alert failed", kind, error instanceof Error ? error.message : String(error));
    return false;
  }
}
