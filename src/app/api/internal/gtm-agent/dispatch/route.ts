import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { gtmWritesEnabled } from "@/lib/gtmPlays/constants";
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
 * off on /ops #5 or GTM writes are off on this server.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!gtmWritesEnabled()) return NextResponse.json({ ok: true, ran: false, reason: "writes_off" });
  try {
    return NextResponse.json({ ok: true, ...(await runAgentTick()) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01") return NextResponse.json({ ok: true, ran: false, reason: "not_migrated" });
    console.error("[gtm-agent] dispatch failed", error);
    return NextResponse.json({ error: "GTM agent dispatch failed" }, { status: 500 });
  }
}
