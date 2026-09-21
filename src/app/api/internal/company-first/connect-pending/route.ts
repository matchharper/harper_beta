import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { retryConnectingCompanyIntros } from "@/lib/org/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

function secretsMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function isAuthorized(req: NextRequest) {
  const configured = [
    process.env.CRON_SECRET?.trim(),
    process.env.INTERNAL_WORKER_API_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
  const authorization = req.headers.get("authorization") ?? "";
  const provided = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  return Boolean(
    provided && configured.some((secret) => secretsMatch(secret, provided))
  );
}

async function run(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await retryConnectingCompanyIntros({ limit: 3 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[company-intro] pending connection retry failed", error);
    return NextResponse.json(
      { error: "Failed to retry pending Company-first introductions" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
