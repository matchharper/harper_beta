import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runVercelCronAutoIntroToCompany } from "@/lib/ops/autoIntroToCompanyLlm";
import { parseAutoIntroToCompanyLimit } from "@/lib/ops/autoIntroToCompanyNotifications";

export const runtime = "nodejs";
export const maxDuration = 300;

function configuredSecrets() {
  return [
    process.env.AUTO_INTRO_TO_COMPANY_API_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function isAuthorized(req: NextRequest, secrets: string[]) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const provided = authorization.slice(7).trim();
  if (!provided) return false;
  return secrets.some((secret) => {
    const expected = Buffer.from(secret);
    const actual = Buffer.from(provided);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  });
}

export async function GET(req: NextRequest) {
  const secrets = configuredSecrets();
  if (secrets.length === 0) {
    return NextResponse.json(
      { error: "Missing AUTO_INTRO_TO_COMPANY_API_SECRET or CRON_SECRET" },
      { status: 500 }
    );
  }
  if (!isAuthorized(req, secrets)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runVercelCronAutoIntroToCompany({
      limit: parseAutoIntroToCompanyLimit(
        req.nextUrl.searchParams.get("limit")
      ),
      roleId: req.nextUrl.searchParams.get("roleId"),
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    });
    const hasFailure =
      result.generation.failedPairCount > 0 ||
      result.delivery.failedCandidateCount > 0 ||
      result.delivery.failedRoleSummaryCount > 0;
    return NextResponse.json(
      { ok: !hasFailure, ...result },
      { status: hasFailure ? 500 : 200 }
    );
  } catch (error) {
    console.error("[auto-intro-to-company:cron]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run auto intro-to-company cron",
      },
      { status: 500 }
    );
  }
}
