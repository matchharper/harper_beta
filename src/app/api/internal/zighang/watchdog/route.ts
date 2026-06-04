import { timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WATCHDOG_DELAY_MS = 30 * 60 * 1000;
const SOURCE_PROVIDER = "zighang";
const DEFAULT_GITHUB_REPOSITORY = "thxxx/data_sc";
const DEFAULT_GITHUB_WORKFLOW_ID = "zighang_incremental_cron.yml";
const DEFAULT_GITHUB_REF = "main";
const DEFAULT_WORKERS = "2";

type IngestionRun = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  from_date: string | null;
  to_date: string | null;
  numbers: Database["public"]["Tables"]["opportunity_ingestion_run"]["Row"]["numbers"];
  error_message: string | null;
};

function getConfiguredCronSecrets() {
  return [
    process.env.ZIGHANG_WATCHDOG_CRON_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function constantTimeEquals(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function isAuthorized(req: NextRequest) {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7).trim();
  if (!provided) return false;

  return getConfiguredCronSecrets().some((secret) =>
    constantTimeEquals(secret, provided)
  );
}

function shouldDryRun(req: NextRequest) {
  const value = req.nextUrl.searchParams.get("dryRun");
  return value === "1" || value === "true";
}

function shouldForce(req: NextRequest) {
  const value = req.nextUrl.searchParams.get("force");
  return value === "1" || value === "true";
}

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getKstScheduleWindow(now: Date) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth();
  const day = kstNow.getUTCDate();

  const scheduledAt = new Date(
    Date.UTC(year, month, day, 12, 10, 0, 0) - KST_OFFSET_MS
  );
  const watchdogReadyAt = new Date(scheduledAt.getTime() + WATCHDOG_DELAY_MS);
  const targetDateKst = [
    String(year).padStart(4, "0"),
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");

  return { scheduledAt, watchdogReadyAt, targetDateKst };
}

async function getLatestRunSinceSchedule(args: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  scheduledAtIso: string;
}) {
  const { data, error } = await args.supabase
    .from("opportunity_ingestion_run")
    .select(
      "id,status,created_at,updated_at,started_at,completed_at,from_date,to_date,numbers,error_message"
    )
    .eq("source_provider", SOURCE_PROVIDER)
    .gte("created_at", args.scheduledAtIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as IngestionRun | null;
}

async function getActiveRun(args: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
}) {
  const { data, error } = await args.supabase
    .from("opportunity_ingestion_run")
    .select(
      "id,status,created_at,updated_at,started_at,completed_at,from_date,to_date,numbers,error_message"
    )
    .eq("source_provider", SOURCE_PROVIDER)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as IngestionRun | null;
}

function getGithubDispatchConfig() {
  const token =
    process.env.ZIGHANG_GITHUB_DISPATCH_TOKEN?.trim() ||
    process.env.GITHUB_ACTIONS_DISPATCH_TOKEN?.trim();
  const repository =
    process.env.ZIGHANG_GITHUB_REPOSITORY?.trim() || DEFAULT_GITHUB_REPOSITORY;
  const workflowId =
    process.env.ZIGHANG_GITHUB_WORKFLOW_ID?.trim() || DEFAULT_GITHUB_WORKFLOW_ID;
  const ref = process.env.ZIGHANG_GITHUB_REF?.trim() || DEFAULT_GITHUB_REF;
  const workers =
    process.env.ZIGHANG_GITHUB_WORKERS?.trim() || DEFAULT_WORKERS;

  if (!token) {
    throw new Error(
      "ZIGHANG_GITHUB_DISPATCH_TOKEN or GITHUB_ACTIONS_DISPATCH_TOKEN is required"
    );
  }

  return { token, repository, workflowId, ref, workers };
}

async function dispatchGithubWorkflow() {
  const { token, repository, workflowId, ref, workers } =
    getGithubDispatchConfig();
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          dry_run: "false",
          workers,
          no_resolve_linkedin: "false",
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub workflow_dispatch failed with ${response.status}: ${body.slice(
        0,
        500
      )}`
    );
  }

  return {
    repository,
    workflowId,
    ref,
    status: response.status,
  };
}

function runBlocksDispatch(run: IngestionRun | null) {
  if (!run) return false;
  return !["failed", "cancelled", "canceled"].includes(run.status);
}

async function handleWatchdog(req: NextRequest) {
  const configuredSecrets = getConfiguredCronSecrets();
  if (configuredSecrets.length === 0) {
    return NextResponse.json(
      { error: "Missing ZIGHANG_WATCHDOG_CRON_SECRET or CRON_SECRET" },
      { status: 500 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { scheduledAt, watchdogReadyAt, targetDateKst } =
    getKstScheduleWindow(now);
  const dryRun = shouldDryRun(req);
  const force = shouldForce(req);

  if (!force && now.getTime() < watchdogReadyAt.getTime()) {
    return NextResponse.json({
      ok: true,
      dispatched: false,
      dryRun,
      reason: "before_watchdog_window",
      targetDateKst,
      nowIso: now.toISOString(),
      scheduledAtIso: scheduledAt.toISOString(),
      watchdogReadyAtIso: watchdogReadyAt.toISOString(),
    });
  }

  const supabase = createSupabaseAdmin();
  const [activeRun, latestRun] = await Promise.all([
    getActiveRun({ supabase }),
    getLatestRunSinceSchedule({
      supabase,
      scheduledAtIso: scheduledAt.toISOString(),
    }),
  ]);

  if (!force && activeRun) {
    return NextResponse.json({
      ok: true,
      dispatched: false,
      dryRun,
      reason: "active_run_exists",
      targetDateKst,
      scheduledAtIso: scheduledAt.toISOString(),
      watchdogReadyAtIso: watchdogReadyAt.toISOString(),
      activeRun,
      latestRun,
    });
  }

  if (!force && runBlocksDispatch(latestRun)) {
    return NextResponse.json({
      ok: true,
      dispatched: false,
      dryRun,
      reason: "scheduled_run_already_seen",
      targetDateKst,
      scheduledAtIso: scheduledAt.toISOString(),
      watchdogReadyAtIso: watchdogReadyAt.toISOString(),
      latestRun,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dispatched: false,
      dryRun: true,
      reason: latestRun
        ? "would_dispatch_after_failed_scheduled_run"
        : "would_dispatch_missing_scheduled_run",
      targetDateKst,
      scheduledAtIso: scheduledAt.toISOString(),
      watchdogReadyAtIso: watchdogReadyAt.toISOString(),
      latestRun,
    });
  }

  const github = await dispatchGithubWorkflow();

  return NextResponse.json({
    ok: true,
    dispatched: true,
    dryRun: false,
    reason: latestRun
      ? "dispatched_after_failed_scheduled_run"
      : "dispatched_missing_scheduled_run",
    targetDateKst,
    scheduledAtIso: scheduledAt.toISOString(),
    watchdogReadyAtIso: watchdogReadyAt.toISOString(),
    latestRun,
    github,
  });
}

export async function GET(req: NextRequest) {
  try {
    return await handleWatchdog(req);
  } catch (error) {
    console.error("[zighang-watchdog] failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run Zighang watchdog",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
