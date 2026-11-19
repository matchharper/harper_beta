import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { dailyReportMessage, reportLink, reportPeriod } from "@/lib/gtmPlays/agent/dailyReport";
import { kstClock } from "@/lib/gtmPlays/agent/people";
import { postToGtmTalent } from "@/lib/gtmPlays/agent/slack.server";
import { agentDaily } from "@/lib/gtmPlays/agent/views.server";
import { GTM_HARPER_ORIGIN } from "@/lib/gtmPlays/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const daily = await agentDaily({ ...period, includeTest: false });
  if (!daily.available) return NextResponse.json({ ok: true, posted: false, reason: "not_migrated" });
  const { text, blocks } = dailyReportMessage({ days: daily.days, total: daily.total, link: reportLink(GTM_HARPER_ORIGIN, period) });
  const dryRun = ["1", "true"].includes(req.nextUrl.searchParams.get("dryRun") ?? "");
  if (dryRun) return NextResponse.json({ ok: true, posted: false, text, blocks });
  const posted = await postToGtmTalent(text, blocks);
  if (!posted.ok) {
    console.error("[gtm-agent] daily report not posted", posted.error);
    return NextResponse.json({ error: posted.error }, { status: posted.status });
  }
  return NextResponse.json({ ok: true, posted: true });
}
