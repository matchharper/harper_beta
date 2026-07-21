import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  parseAutoIntroToCompanyLimit,
  runAutoIntroToCompanyNotifications,
} from "@/lib/ops/autoIntroToCompanyNotifications";

export const runtime = "nodejs";
export const maxDuration = 300;

function getConfiguredCronSecrets() {
  return [
    process.env.AUTO_INTRO_TO_COMPANY_CRON_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function isAuthorized(req: NextRequest) {
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

async function handleAutoIntroToCompany(req: NextRequest) {
  const configuredSecrets = getConfiguredCronSecrets();
  if (configuredSecrets.length === 0) {
    return NextResponse.json(
      { error: "Missing AUTO_INTRO_TO_COMPANY_CRON_SECRET or CRON_SECRET" },
      { status: 500 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runAutoIntroToCompanyNotifications({
    dryRun: shouldDryRun(req),
    limit: parseAutoIntroToCompanyLimit(req.nextUrl.searchParams.get("limit")),
    roleId: req.nextUrl.searchParams.get("roleId"),
    workspaceId: req.nextUrl.searchParams.get("workspaceId"),
  });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) {
  try {
    return await handleAutoIntroToCompany(req);
  } catch (error) {
    console.error("[auto-intro-to-company]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send auto intro-to-company notifications",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
