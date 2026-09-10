import { NextRequest, NextResponse } from "next/server";
import {
  createOpsUtmAccessSessionToken,
  getConfiguredOpsUtmAccessUuid,
  hasOpsUtmUuidAccess,
  isOpsUtmUuidAccessEnabled,
  matchesOpsUtmAccessUuid,
  OPS_UTM_ACCESS_COOKIE_NAME,
  OPS_UTM_ACCESS_MAX_AGE_SECONDS,
} from "@/lib/ops/utmAccessServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAILED_ATTEMPT_LIMIT = 12;
const FAILED_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPT_ENTRIES = 1_000;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function getClientKey(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function isRateLimited(clientKey: string) {
  const now = Date.now();
  const entry = failedAttempts.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    failedAttempts.delete(clientKey);
    return false;
  }
  return entry.count >= FAILED_ATTEMPT_LIMIT;
}

function recordFailedAttempt(clientKey: string) {
  const now = Date.now();
  if (failedAttempts.size >= MAX_FAILED_ATTEMPT_ENTRIES) {
    for (const [key, entry] of failedAttempts) {
      if (entry.resetAt <= now) failedAttempts.delete(key);
    }
    if (failedAttempts.size >= MAX_FAILED_ATTEMPT_ENTRIES) {
      failedAttempts.delete(failedAttempts.keys().next().value ?? "");
    }
  }

  const existing = failedAttempts.get(clientKey);
  failedAttempts.set(clientKey, {
    count: existing && existing.resetAt > now ? existing.count + 1 : 1,
    resetAt:
      existing && existing.resetAt > now
        ? existing.resetAt
        : now + FAILED_ATTEMPT_WINDOW_MS,
  });
}

type OpsUtmAccessErrorCode = "invalid" | "not_configured" | "rate_limited";

function formRedirect(req: NextRequest, errorCode?: OpsUtmAccessErrorCode) {
  const url = new URL("/ops/utm", req.url);
  if (errorCode) url.searchParams.set("utmAccessError", errorCode);
  return NextResponse.redirect(url, 303);
}

function errorResponse(args: {
  error: string;
  errorCode: OpsUtmAccessErrorCode;
  formSubmission: boolean;
  req: NextRequest;
  status: number;
}) {
  return withNoStore(
    args.formSubmission
      ? formRedirect(args.req, args.errorCode)
      : NextResponse.json({ error: args.error }, { status: args.status })
  );
}

async function readSubmittedUuid(req: NextRequest) {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  const formSubmission = contentType.includes(
    "application/x-www-form-urlencoded"
  );
  if (formSubmission) {
    const formData = await req.formData();
    return { formSubmission, uuid: formData.get("uuid") };
  }

  const body = (await req.json().catch(() => null)) as {
    uuid?: unknown;
  } | null;
  return { formSubmission, uuid: body?.uuid };
}

export async function GET(req: NextRequest) {
  return withNoStore(
    NextResponse.json({
      enabled: isOpsUtmUuidAccessEnabled(),
      granted: hasOpsUtmUuidAccess(req),
    })
  );
}

export async function POST(req: NextRequest) {
  const { formSubmission, uuid } = await readSubmittedUuid(req);
  const configuredUuid = getConfiguredOpsUtmAccessUuid();
  if (!configuredUuid) {
    return errorResponse({
      error: "UUID 접근이 설정되지 않았습니다.",
      errorCode: "not_configured",
      formSubmission,
      req,
      status: 503,
    });
  }

  const clientKey = getClientKey(req);
  if (isRateLimited(clientKey)) {
    return errorResponse({
      error: "입력 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      errorCode: "rate_limited",
      formSubmission,
      req,
      status: 429,
    });
  }

  if (!matchesOpsUtmAccessUuid(uuid, configuredUuid)) {
    recordFailedAttempt(clientKey);
    return errorResponse({
      error: "UUID를 확인해 주세요.",
      errorCode: "invalid",
      formSubmission,
      req,
      status: 401,
    });
  }

  failedAttempts.delete(clientKey);
  const response = formSubmission
    ? formRedirect(req)
    : new NextResponse(null, { status: 204 });
  response.cookies.set(
    OPS_UTM_ACCESS_COOKIE_NAME,
    createOpsUtmAccessSessionToken({ accessUuid: configuredUuid }),
    {
      httpOnly: true,
      maxAge: OPS_UTM_ACCESS_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    }
  );
  return withNoStore(response);
}

export async function DELETE() {
  const response = NextResponse.json({ granted: false });
  response.cookies.set(OPS_UTM_ACCESS_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return withNoStore(response);
}
