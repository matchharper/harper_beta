import { timingSafeEqual } from "crypto";
import { IncomingWebhook } from "@slack/webhook";
import { NextRequest, NextResponse } from "next/server";
import {
  buildDailyUserStatsReport,
  formatDailyUserStatsSlackMessage,
  resolveDailyUserStatsDate,
} from "@/lib/dailyUserStats";

export const runtime = "nodejs";

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

function getInternalSlackWebhook() {
  const webhookUrl = process.env.SLACK_INTERNAL_NOTI_TOKEN?.trim();
  if (!webhookUrl) {
    throw new Error("SLACK_INTERNAL_NOTI_TOKEN is required");
  }

  return new IncomingWebhook(webhookUrl);
}

function shouldDryRun(req: NextRequest) {
  const value = req.nextUrl.searchParams.get("dryRun");
  return value === "1" || value === "true";
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
  const report = await buildDailyUserStatsReport(date);
  const message = formatDailyUserStatsSlackMessage(report);

  if (shouldDryRun(req)) {
    return NextResponse.json({
      dryRun: true,
      message,
      report,
    });
  }

  await getInternalSlackWebhook().send({ text: message });

  return NextResponse.json({
    date: report.date,
    ok: true,
    sent: true,
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
