import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchAutoIntroToCompanyCandidateDossiers,
  parseAutoIntroToCompanyLimit,
  sendCodexAuthoredAutoIntroToCompanyNotifications,
  type CodexAuthoredWorkspaceMessage,
} from "@/lib/ops/autoIntroToCompanyNotifications";

export const runtime = "nodejs";
export const maxDuration = 300;

function getConfiguredApiSecrets() {
  return [
    process.env.AUTO_INTRO_TO_COMPANY_API_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function isAuthorized(req: NextRequest) {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7).trim();
  if (!provided) return false;

  return getConfiguredApiSecrets().some((secret) => {
    const expectedBuffer = Buffer.from(secret);
    const actualBuffer = Buffer.from(provided);
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  });
}

function authenticationError(req: NextRequest) {
  const configuredSecrets = getConfiguredApiSecrets();
  if (configuredSecrets.length === 0) {
    return NextResponse.json(
      { error: "Missing AUTO_INTRO_TO_COMPANY_API_SECRET or CRON_SECRET" },
      { status: 500 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function requestFilters(req: NextRequest) {
  return {
    limit: parseAutoIntroToCompanyLimit(req.nextUrl.searchParams.get("limit")),
    roleId: req.nextUrl.searchParams.get("roleId"),
    workspaceId: req.nextUrl.searchParams.get("workspaceId"),
  };
}

export async function GET(req: NextRequest) {
  try {
    const authError = authenticationError(req);
    if (authError) return authError;
    const result = await fetchAutoIntroToCompanyCandidateDossiers(
      requestFilters(req)
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[auto-intro-to-company:get]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load auto intro-to-company candidates",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = authenticationError(req);
    if (authError) return authError;
    const payload = (await req.json()) as {
      groups?: CodexAuthoredWorkspaceMessage[];
    };
    if (!Array.isArray(payload.groups)) {
      return NextResponse.json(
        { error: "groups must be an array" },
        { status: 400 }
      );
    }
    const result = await sendCodexAuthoredAutoIntroToCompanyNotifications({
      ...requestFilters(req),
      groups: payload.groups,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[auto-intro-to-company:post]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to deliver Codex-authored auto intro messages",
      },
      { status: 500 }
    );
  }
}
