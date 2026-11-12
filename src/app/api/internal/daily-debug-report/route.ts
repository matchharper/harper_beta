import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildDailyDebugReport } from "@/lib/dailyDebugReport.server";
import { formatDailyDebugSlackMessages } from "@/lib/dailyDebugReport";

export const runtime = "nodejs";
export const maxDuration = 300;
const CHANNEL_ID = "C0BULQ5K5EJ";

async function postMessage(text: string, threadTs?: string) {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) throw new Error("SLACK_BOT_TOKEN is required");
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: CHANNEL_ID,
      text,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      unfurl_links: false,
      unfurl_media: false,
      parse: "none",
    }),
  });
  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    ts?: string;
    error?: string;
  } | null;
  if (!response.ok || !result?.ok || !result.ts)
    throw new Error(
      `Slack chat.postMessage failed: ${result?.error ?? response.status}`
    );
  return result.ts;
}

export async function GET(req: NextRequest) {
  const secrets = [
    process.env.DAILY_USER_STATS_CRON_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((s) => s?.trim())
    .filter(Boolean) as string[];
  if (!secrets.length)
    return NextResponse.json({ error: "Missing cron secret" }, { status: 500 });
  const auth = req.headers.get("authorization");
  const provided = Buffer.from(
    auth?.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  );
  if (
    !secrets.some((secret) => {
      const expected = Buffer.from(secret);
      return (
        provided.length === expected.length &&
        timingSafeEqual(provided, expected)
      );
    })
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );

  try {
    const report = await buildDailyDebugReport(
      req.nextUrl.searchParams.get("date")
    );
    const messages = formatDailyDebugSlackMessages(report);
    if (["1", "true"].includes(req.nextUrl.searchParams.get("dryRun") ?? "")) {
      return NextResponse.json({
        dryRun: true,
        channelId: CHANNEL_ID,
        report,
        messages,
      });
    }
    const threadTs = await postMessage(messages.main);
    for (const text of messages.details) {
      // Slack permits about one message per second in the same channel.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await postMessage(text, threadTs);
    }
    const complete = [
      report.runs,
      report.deliveries,
      report.tools,
      report.recommendations,
      report.replies,
      report.schedules,
      report.sources,
      report.profiles,
      report.profileErrors,
      report.searches,
      report.browsers,
    ].every((s) => s.data !== null);
    return NextResponse.json({
      ok: complete,
      sent: true,
      date: report.date,
      channelId: CHANNEL_ID,
      threadTs,
      complete,
    });
  } catch (error) {
    console.error(
      "[daily-debug-report] Failed to generate or send report",
      error
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Daily debug report failed",
      },
      { status: 500 }
    );
  }
}
