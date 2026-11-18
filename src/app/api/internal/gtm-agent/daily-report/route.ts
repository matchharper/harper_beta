import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { dailyReportText, reportLink, reportPeriod } from "@/lib/gtmPlays/agent/dailyReport";
import { kstClock } from "@/lib/gtmPlays/agent/people";
import { readAgentSettings } from "@/lib/gtmPlays/agent/store.server";
import { agentDaily } from "@/lib/gtmPlays/agent/views.server";
import { GTM_HARPER_ORIGIN } from "@/lib/gtmPlays/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** #gtm-talent (Shaun 11/18: the #5 daily numbers go there). */
const SLACK_GTM_TALENT_CHANNEL_ID = "C0A795ULXGF";

function authorized(req: NextRequest) {
  const provided = Buffer.from((req.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "").trim());
  return [process.env.CRON_SECRET?.trim(), process.env.INTERNAL_WORKER_API_SECRET?.trim()]
    .filter((secret): secret is string => Boolean(secret))
    .map((secret) => Buffer.from(secret))
    .some((secret) => provided.length === secret.length && timingSafeEqual(secret, provided));
}

/**
 * Cron (daily, 09:00 KST): the #5 agent's numbers for the last 7 days as a table in #gtm-talent, with a link that opens
 * /ops 하루별 성능 on the same days (agent/dailyReport.ts). ?dryRun=1 returns the message without posting.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const period = reportPeriod(kstClock(new Date()).day);
  const [daily, settings] = await Promise.all([agentDaily({ ...period, includeTest: false }), readAgentSettings()]);
  if (!daily.available) return NextResponse.json({ ok: true, posted: false, reason: "not_migrated" });
  const text = dailyReportText({
    days: daily.days, total: daily.total, period, link: reportLink(GTM_HARPER_ORIGIN, period), agentOn: settings.enabled,
  });
  const dryRun = ["1", "true"].includes(req.nextUrl.searchParams.get("dryRun") ?? "");
  if (dryRun) return NextResponse.json({ ok: true, posted: false, text });
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: "SLACK_BOT_TOKEN is required" }, { status: 500 });
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: SLACK_GTM_TALENT_CHANNEL_ID, text, unfurl_links: false, unfurl_media: false }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !result?.ok) {
    console.error("[gtm-agent] daily report not posted", response.status, result?.error);
    return NextResponse.json({ error: result?.error ?? `slack ${response.status}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, posted: true });
}
