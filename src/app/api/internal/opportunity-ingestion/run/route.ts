import { NextRequest, NextResponse } from "next/server";
import {
  createOpportunityIngestionRun,
  getOpportunityAdmin,
} from "@/lib/opportunityDiscovery/store";

export const runtime = "nodejs";

const getConfiguredSecrets = () =>
  [process.env.OPPORTUNITY_CRON_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

const isAuthorized = (req: NextRequest) => {
  const configuredSecrets = getConfiguredSecrets();
  if (configuredSecrets.length === 0) return false;

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  return configuredSecrets.includes(token);
};

async function runManualIngestion(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
  };
  const rawLimit =
    typeof body.limit === "number"
      ? body.limit
      : Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(200, Math.floor(rawLimit)))
    : 50;

  try {
    const admin = getOpportunityAdmin();
    const run = await createOpportunityIngestionRun({
      admin,
      limit,
      trigger: "manual_admin_refresh",
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      runId: run.id,
      workerCommand: `cd harper_worker && python opportunity_worker.py ingestion --run-id ${run.id} --limit ${limit}`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run opportunity ingestion";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runManualIngestion(req);
}

export async function GET(req: NextRequest) {
  return runManualIngestion(req);
}
