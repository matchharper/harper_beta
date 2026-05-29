import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { runAshbyOfficialJobsSync } from "@/lib/ashbyOfficialJobsSync";

export const runtime = "nodejs";

function getConfiguredCronSecrets() {
  return [
    process.env.ASHBY_SYNC_CRON_SECRET?.trim(),
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

async function authorize(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return;
  } catch (error) {
    if (isSecretAuthorized(req)) return;
    throw error;
  }
}

async function parseUnpublishMissing(req: NextRequest) {
  if (req.method === "GET") {
    const value = req.nextUrl.searchParams.get("unpublishMissing");
    return value !== "false";
  }

  const body = (await req.json().catch(() => ({}))) as {
    unpublishMissing?: unknown;
  };
  return body.unpublishMissing !== false;
}

async function handleSync(req: NextRequest) {
  await authorize(req);

  const summary = await runAshbyOfficialJobsSync({
    unpublishMissing: await parseUnpublishMissing(req),
  });

  return NextResponse.json(summary);
}

export async function GET(req: NextRequest) {
  try {
    return await handleSync(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to sync Ashby jobs");
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handleSync(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to sync Ashby jobs");
  }
}
