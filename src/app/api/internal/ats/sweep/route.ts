import { NextResponse } from "next/server";
import { runAtsSequenceSweep } from "@/lib/ats/server";

export const runtime = "nodejs";

function getConfiguredCronSecrets() {
  return [process.env.ATS_CRON_SECRET?.trim(), process.env.CRON_SECRET?.trim()].filter(
    (value): value is string => Boolean(value)
  );
}

function isAuthorized(req: Request) {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return false;

  return getConfiguredCronSecrets().includes(token);
}

function readLimit(req: Request, bodyLimit?: unknown) {
  const searchLimit = new URL(req.url).searchParams.get("limit");
  const raw = bodyLimit ?? searchLimit;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25;
  }

  return Math.floor(parsed);
}

async function handleSweep(req: Request) {
  const configuredSecrets = getConfiguredCronSecrets();
  if (configuredSecrets.length === 0) {
    return NextResponse.json(
      { error: "Missing ATS_CRON_SECRET or CRON_SECRET" },
      { status: 500 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body =
    req.method === "POST"
      ? ((await req.json().catch(() => ({}))) as { limit?: unknown })
      : {};
  const limit = readLimit(req, body.limit);

  console.info("[ats-sweep] started", {
    limit,
    method: req.method,
    nowIso: new Date().toISOString(),
    userAgent: req.headers.get("user-agent") ?? "unknown",
  });
  try {
    const summary = await runAtsSequenceSweep({ limit });

    console.info("[ats-sweep] completed", summary);

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sweep ATS sequences";
    console.error("[ats-sweep] failed", { error: message, limit });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleSweep(req);
}

export async function POST(req: Request) {
  return handleSweep(req);
}
