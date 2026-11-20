import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { gtmWritesEnabled } from "@/lib/gtmPlays/constants";
import { recordUnmatchedSkipped } from "@/lib/gtmPlays/agent/conversationViews.server";
import { syncAgentReplies } from "@/lib/gtmPlays/agent/replies.server";
import { runAgentTick } from "@/lib/gtmPlays/agent/run.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const provided = Buffer.from((req.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "").trim());
  return [process.env.CRON_SECRET?.trim(), process.env.INTERNAL_WORKER_API_SECRET?.trim()]
    .filter((secret): secret is string => Boolean(secret))
    .map((secret) => Buffer.from(secret))
    .some((secret) => provided.length === secret.length && timingSafeEqual(secret, provided));
}

/**
 * Cron (5 min): one tick of the #5 candidate outreach agent (/ops/gtm-plays tab 5). Does nothing while the agent is
 * off on /ops #5 or GTM writes are off on this server. Replies in the team mailboxes are read first, also while the
 * agent is off (mails already out still get answers), so a reply stops a follow-up this tick would send; that read
 * is bounded (about 25 s) and never fails the tick (agent/replies.server.ts).
 */
export async function GET(req: NextRequest) {
  // The tick's time slices count from here (the reply read runs first): no new mail after ~240 s.
  const startedAt = Date.now();
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!gtmWritesEnabled()) return NextResponse.json({ ok: true, ran: false, reason: "writes_off" });
  const replies = await syncAgentReplies();
  // The mails it left unopened (not threaded to an agent mail), a count per day for /ops 로그 · 메일.
  await recordUnmatchedSkipped(replies.mailboxes ?? []);
  try {
    return NextResponse.json({ ok: true, replies, ...(await runAgentTick({ startedAt })) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01") return NextResponse.json({ ok: true, ran: false, reason: "not_migrated" });
    console.error("[gtm-agent] dispatch failed", error);
    return NextResponse.json({ error: "GTM agent dispatch failed" }, { status: 500 });
  }
}
