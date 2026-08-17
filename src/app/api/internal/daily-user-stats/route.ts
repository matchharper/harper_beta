import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildDailyUserStatsReportComparison,
  formatDailyUserStatsSlackMessage,
  formatDailyUserStatsSlackMessages,
  resolveDailyUserStatsDate,
} from "@/lib/dailyUserStats";
import {
  buildDailyCompanyStatsReport,
  formatDailyCompanyStatsSlackMessage,
} from "@/lib/dailyCompanyStats";

export const runtime = "nodejs";

const SLACK_DAILY_USER_STATS_CHANNEL_ID = "C0B2TFPUS6P";
const SLACK_DAILY_COMPANY_STATS_CHANNEL_ID = "C0AKK93FMH8";
const SLACK_DEV_CHANNEL_ID = "C0AB43Q9U58";

function getConfiguredCronSecrets() {
  return [
    process.env.DAILY_USER_STATS_CRON_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function isSecretAuthorized(req: NextRequest) {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7).trim();
  if (!provided) return false;

  return getConfiguredCronSecrets().some((secret) => {
    const expectedBuffer = Buffer.from(secret);
    const actualBuffer = Buffer.from(provided);
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  });
}

function shouldDryRun(req: NextRequest) {
  const value = req.nextUrl.searchParams.get("dryRun");
  return value === "1" || value === "true";
}

async function postSlackMessage(args: {
  channelId: string;
  text: string;
  threadTs?: string;
}) {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is required");
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    body: JSON.stringify({
      channel: args.channelId,
      text: args.text,
      ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
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
    ts?: string;
  } | null;

  if (!response.ok || !result?.ok || !result.ts) {
    throw new Error(
      `Slack chat.postMessage failed: ${result?.error ?? response.status}`
    );
  }

  return result.ts;
}

async function handleDailyUserStats(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  const configuredSecrets = getConfiguredCronSecrets();
  if (configuredSecrets.length === 0) {
    return NextResponse.json(
      { error: "Missing DAILY_USER_STATS_CRON_SECRET or CRON_SECRET" },
      { status: 500 }
    );
  }

  if (!isSecretAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = resolveDailyUserStatsDate(req.nextUrl.searchParams.get("date"));
  const [{ previousReport, report }, companyReport] = await Promise.all([
    buildDailyUserStatsReportComparison(date),
    buildDailyCompanyStatsReport(date),
  ]);
  const message = formatDailyUserStatsSlackMessage(report, previousReport);
  const messages = formatDailyUserStatsSlackMessages(report, previousReport);
  const companyMessage = formatDailyCompanyStatsSlackMessage(companyReport);

  if (shouldDryRun(req)) {
    return NextResponse.json({
      companyMessage,
      companyReport,
      dryRun: true,
      message,
      messages,
      previousReport,
      report,
    });
  }

  const threadTs = await postSlackMessage({
    channelId: SLACK_DAILY_USER_STATS_CHANNEL_ID,
    text: messages.main,
  });
  await postSlackMessage({
    channelId: SLACK_DAILY_USER_STATS_CHANNEL_ID,
    text: messages.details,
    threadTs,
  });
  const companyThreadTs = await postSlackMessage({
    channelId: SLACK_DAILY_COMPANY_STATS_CHANNEL_ID,
    text: companyMessage,
  });

  return NextResponse.json({
    companyThreadTs,
    date: report.date,
    ok: true,
    sent: true,
    threadTs,
  });
}

export async function GET(req: NextRequest) {
  try {
    return await handleDailyUserStats(req);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send daily user stats",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
