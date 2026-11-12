import { randomUUID } from "node:crypto";
import { v5 as uuidv5 } from "uuid";
import { INTERNAL_HIRING_CHANNEL, internalHiringNotificationText, type InternalHiringFacts } from "./internalHiringNotificationText";

type Admin = { from: (name: string) => any };
type Notice = { id: string; facts: InternalHiringFacts };

/** Called immediately by the committed-event webhook; cron only recovers misses/failures. */
export async function deliverInternalHiringNotification(admin: Admin, id: string, fetcher = fetch) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true" || process.env.HARPER_LOCAL_E2E === "1") return "isolated";
  const lease = randomUUID();
  const { data, error } = await admin.from("internal_hiring_notifications")
    .update({ lease_id: lease, attempt_after: new Date(Date.now() + 60_000).toISOString() })
    .eq("id", id).is("sent_at", null).lte("attempt_after", new Date().toISOString())
    .select("id,facts").maybeSingle();
  if (error) throw error;
  if (!data) return "skipped";
  const notice = data as Notice;
  try {
    const token = process.env.SLACK_BOT_TOKEN?.trim();
    if (!token) throw new Error("SLACK_BOT_TOKEN missing");
    const response = await fetcher("https://slack.com/api/chat.postMessage", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: INTERNAL_HIRING_CHANNEL,
        client_msg_id: uuidv5(`internal-hiring:${id}`, uuidv5.URL),
        text: internalHiringNotificationText(notice.facts), unfurl_links: false, unfurl_media: false }),
    });
    const result = await response.json() as { ok?: boolean; error?: string; ts?: string };
    if (!response.ok || !result.ok || !result.ts) throw new Error(`Slack: ${result.error ?? response.status}`);
    const saved = await admin.from("internal_hiring_notifications")
      .update({ sent_at: new Date().toISOString(), slack_ts: result.ts, last_error: null, lease_id: null })
      .eq("id", id).eq("lease_id", lease);
    if (saved.error) throw saved.error;
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const saved = await admin.from("internal_hiring_notifications")
      .update({ lease_id: null, attempt_after: new Date(Date.now() + 300_000).toISOString(), last_error: message })
      .eq("id", id).eq("lease_id", lease);
    if (saved.error) throw saved.error;
    console.error("[internal-hiring/slack]", id, message);
    return "retry";
  }
}

export async function retryInternalHiringNotifications(admin: Admin) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true" || process.env.HARPER_LOCAL_E2E === "1") return;
  const { data, error } = await admin.from("internal_hiring_notifications").select("id")
    .is("sent_at", null).lte("attempt_after", new Date().toISOString()).order("created_at").limit(20);
  if (error) throw error;
  const deadline = Date.now() + 40_000; // The shared cron has a 60-second runtime.
  for (const row of data ?? []) {
    if (Date.now() >= deadline) break;
    await deliverInternalHiringNotification(admin, row.id);
    // Slack's per-channel posting rate is one message per second.
    await new Promise(resolve => setTimeout(resolve, 1_100));
  }
}
