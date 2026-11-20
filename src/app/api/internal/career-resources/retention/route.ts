import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { careerExecutionEnvironment } from "@/lib/career/executionEnvironment";
import { retireResourceCache } from "@/lib/career/resources/retention";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "",
    actual =
      request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  if (
    !expected ||
    Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (careerExecutionEnvironment() !== "production")
    return NextResponse.json({ skipped: "production maintenance only" });
  try {
    return NextResponse.json(
      await retireResourceCache(getTalentSupabaseAdmin())
    );
  } catch (error) {
    console.error("[career-resources] retention failed", error);
    return NextResponse.json(
      { error: "Cache maintenance failed" },
      { status: 500 }
    );
  }
}
