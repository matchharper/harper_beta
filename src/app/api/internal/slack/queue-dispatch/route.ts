import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchSlackReplyJob } from "@/lib/org/slackQueueDispatch";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const maxDuration = 60;

const RECOVERY_LIMIT = 20;

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const provided = authorization.slice(7).trim();
  const expectedBuffer = Buffer.from(secret);
  const actualBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
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
      admin.from("slack_reply_jobs" as any) as any
    )
      .select("id")
      .eq("worker_target", "vercel_queue")
      .in("queue_dispatch_status", ["pending", "retry"])
      .in("status", ["queued", "retry"])
      .lte("queue_next_attempt_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(RECOVERY_LIMIT);
    if (error) throw error;

    const failures: string[] = [];
    let dispatched = 0;
    let skipped = 0;
    for (const job of jobs ?? []) {
      const jobId = String(job.id ?? "").trim();
      if (!jobId) continue;
      try {
        const result = await dispatchSlackReplyJob({
          admin,
          jobId,
          source: "recovery",
        });
        // The channel can be switched back to the legacy worker between this
        // Cron query and the guarded publish. That is an intentional no-op,
        // not a successful Queue dispatch.
        if (result) dispatched += 1;
        else skipped += 1;
      } catch (dispatchError) {
        console.error("[harper-slack/queue-dispatch:recovery]", {
          error:
            dispatchError instanceof Error
              ? dispatchError.message
              : "Queue dispatch failed",
          jobId,
        });
        failures.push(jobId);
      }
    }

    return NextResponse.json(
      {
        attempted: (jobs ?? []).length,
        dispatched,
        failedJobIds: failures,
        ok: failures.length === 0,
        skipped,
      },
      { status: failures.length > 0 ? 500 : 200 }
    );
  } catch (error) {
    console.error("[harper-slack/queue-dispatch]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to recover Slack Queue dispatches",
      },
      { status: 500 }
    );
  }
}
