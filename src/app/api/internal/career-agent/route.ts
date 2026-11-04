import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { acceptCareerBackgroundRun, recoverCareerBackgroundRuns } from "@/lib/career/background/server";
import { recoverCareerEmailDeliveries } from "@/lib/career/background/delivery";
import { collectDueCareerWork } from "@/lib/career/schedules/server";
import { resumeCareerAgentAfterWork } from "@/lib/career/agentContinuation";
import { requestExternalMatchingSearch, recoverCareerMatchingSearches, publishCareerMatchingSearch } from "@/lib/career/matching/externalSearch";
import { recoverInternalEvaluations } from "@/lib/career/matching/internalScoring/backend";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const expected = process.env.INTERNAL_WORKER_API_SECRET?.trim();
  const actual = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  if (!expected || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const admin = getTalentSupabaseAdmin();
    if (body.action === "collect_due") {
      const work = await collectDueCareerWork({ admin });
      const matching = await recoverCareerMatchingSearches(admin);
      const internalMatching = await recoverInternalEvaluations();
      const recovery = await recoverCareerBackgroundRuns(admin);
      const deliveries = await recoverCareerEmailDeliveries(admin);
      return NextResponse.json({ work, matching, internalMatching, recovery, deliveries });
    }
    if (["evaluation_complete", "external_follow_evaluation", "external_evaluation_ready"].includes(body.action)) {
      const { data: run, error } = await (admin.from as any)("opportunity_discovery_run").select("*").eq("id", body.discoveryRunId).single();
      if (error) throw error;
      if (body.action === "external_evaluation_ready") {
        if (run.trigger !== "career_external_context" || !["completed", "failed", "cancelled"].includes(run.status) || !body.leaseToken || run.lease_token !== body.leaseToken) return NextResponse.json({ error: "Context preparation is not complete" }, { status: 409 });
        const { data: search, error: searchError } = await (admin.from as any)("external_recommendation_runs").select("id")
          .eq("id", run.trigger_payload.externalRunId).eq("talent_id", run.talent_id).single();
        if (searchError) throw searchError;
        await publishCareerMatchingSearch(search.id);
        return NextResponse.json({ accepted: true });
      }
      if (body.action === "external_follow_evaluation") {
        if (run.trigger !== "career_follow_external_evaluation" || run.status !== "running" || !body.leaseToken || run.lease_token !== body.leaseToken) return NextResponse.json({ error: "Evaluation lease changed" }, { status: 409 });
        const result = await requestExternalMatchingSearch({ admin, userId: run.talent_id, conversationId: run.conversation_id,
          operationId: run.trigger_payload.operationId, roleIds: run.trigger_payload.roleIds, sourceEvents: run.trigger_payload.sourceEvents });
        return NextResponse.json(result);
      }
      if (run.trigger !== "career_internal_evaluation" || ["queued", "running", "handed_off"].includes(run.status)) return NextResponse.json({ error: "Evaluation is not terminal" }, { status: 409 });
      if (run.trigger_payload?.parentReplyId && run.conversation_id) await resumeCareerAgentAfterWork({ admin, userId: run.talent_id,
        conversationId: run.conversation_id, replyId: run.trigger_payload.parentReplyId });
      return NextResponse.json({ accepted: true });
    }
    if (typeof body.discoveryRunId !== "string" || typeof body.leaseToken !== "string") return NextResponse.json({ error: "Run and lease are required" }, { status: 400 });
    return NextResponse.json(await acceptCareerBackgroundRun({ admin, discoveryRunId: body.discoveryRunId, leaseToken: body.leaseToken }));
  } catch (error) {
    console.error("[career-agent] internal dispatch failed", error);
    return NextResponse.json({ error: "Career dispatch failed" }, { status: 500 });
  }
}
