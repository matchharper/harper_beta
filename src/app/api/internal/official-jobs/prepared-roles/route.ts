import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { careerExecutionEnvironment } from "@/lib/career/executionEnvironment";
import { buildOfficialJobPreparedRoles } from "@/lib/officialJobs/preparedRoles.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const provided = Buffer.from((req.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "").trim());
  return [process.env.CRON_SECRET?.trim(), process.env.INTERNAL_WORKER_API_SECRET?.trim()]
    .filter((secret): secret is string => Boolean(secret))
    .map((secret) => Buffer.from(secret))
    .some((secret) => provided.length === secret.length && timingSafeEqual(secret, provided));
}

/**
 * Cron (daily, 03:00 KST): the Harper-connected Roles and public postings prepared for each published /jobs posting
 * with no Harper Role behind it (officialJobs/preparedRoles.ts), read by Harper's first message to a person who signs
 * up from that posting. ?dryRun=1 returns the picks without writing; ?slug=<slug> builds one posting. Only production
 * writes (a local server reads and writes the production database).
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dryRun = ["1", "true"].includes(req.nextUrl.searchParams.get("dryRun") ?? "");
  if (!dryRun && careerExecutionEnvironment() !== "production")
    return NextResponse.json({ skipped: "production writes only; use ?dryRun=1" });
  const slugs = req.nextUrl.searchParams.getAll("slug").map((slug) => slug.trim()).filter(Boolean);
  try {
    return NextResponse.json(await buildOfficialJobPreparedRoles({ dryRun, slugs }));
  } catch (error) {
    console.error("[official-jobs:prepared-roles] build failed", error);
    return NextResponse.json({ error: "Prepared roles build failed" }, { status: 500 });
  }
}
