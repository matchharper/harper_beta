import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchOrgAgentWebActionJob } from "@/lib/org/agent/webActionTurn";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = req.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = authorization.slice(7).trim();
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: jobs, error } = await (
      admin.from("company_agent_web_action_jobs" as any) as any
    )
      .select("id")
      .in("queue_dispatch_status", ["pending", "retry"])
      .in("status", ["queued", "retry"])
      .lte("queue_next_attempt_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) throw error;

    let dispatched = 0;
    const failedJobIds: string[] = [];
    for (const job of jobs ?? []) {
      const jobId = String(job.id ?? "").trim();
      if (!jobId) continue;
      if (await dispatchOrgAgentWebActionJob({ admin, jobId })) dispatched += 1;
      else failedJobIds.push(jobId);
    }
    return NextResponse.json({
      attempted: (jobs ?? []).length,
      dispatched,
      failedJobIds,
      ok: failedJobIds.length === 0,
    });
  } catch (error) {
    console.error("[org-agent/web-action:dispatch-recovery]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to recover company agent web-action dispatches",
      },
      { status: 500 }
    );
  }
}
