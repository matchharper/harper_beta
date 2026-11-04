import { NextResponse } from "next/server";
import { dispatchEmailRuntimeJobs } from "@/lib/email/runtime/queue";
import { dispatchCareerAgentReplies } from "@/lib/career/agentReplyRecovery";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [email, career] = await Promise.allSettled([
    dispatchEmailRuntimeJobs(),
    dispatchCareerAgentReplies(),
  ]);
  if (email.status === "rejected") console.error("[email-runtime/dispatch]", email.reason);
  if (career.status === "rejected") console.error("[career-agent/dispatch]", career.reason);
  const ok = email.status === "fulfilled" && career.status === "fulfilled";
  return NextResponse.json({
    ok,
    ...(email.status === "fulfilled" ? email.value : { error: "Email dispatch failed" }),
    careerReplies: career.status === "fulfilled" ? career.value : { error: "Career reply dispatch failed" },
  }, { status: ok ? 200 : 500 });
}
