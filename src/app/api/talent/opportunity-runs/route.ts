import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  createOpportunityDiscoveryRun,
  fetchLatestOpportunityRun,
  getActiveOpportunityRun,
  getOpportunityAdmin,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import type { OpportunityDiscoveryTrigger } from "@/lib/opportunityDiscovery/types";

export const runtime = "nodejs";

const isTrigger = (value: unknown): value is OpportunityDiscoveryTrigger =>
  value === "conversation_completed" ||
  value === "immediate_opportunity_requested" ||
  value === "all_batch_feedback_submitted" ||
  value === "preference_became_more_active" ||
  value === "periodic_refresh_due";

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getOpportunityAdmin();
    const run = await fetchLatestOpportunityRun({ admin, userId: user.id });
    return NextResponse.json({ ok: true, run: serializeOpportunityRun(run) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load opportunity run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      chatPreviewCount?: number;
      conversationId?: string;
      targetRecommendationCount?: number;
      trigger?: unknown;
      triggerPayload?: Record<string, unknown>;
    };

    if (!isTrigger(body.trigger)) {
      return NextResponse.json({ error: "Invalid trigger" }, { status: 400 });
    }

    const admin = getOpportunityAdmin();
    const conversationId = String(body.conversationId ?? "").trim() || null;
    if (conversationId) {
      const activeRun = await getActiveOpportunityRun({
        admin,
        conversationId,
        userId: user.id,
      });
      if (activeRun) {
        return NextResponse.json({
          ok: true,
          run: serializeOpportunityRun(activeRun),
          runId: activeRun.id,
        });
      }
    }

    const run = await createOpportunityDiscoveryRun({
      admin,
      chatPreviewCount: body.chatPreviewCount,
      conversationId,
      talentId: user.id,
      targetRecommendationCount: body.targetRecommendationCount,
      trigger: body.trigger,
      triggerPayload: body.triggerPayload ?? {},
    });

    console.info("[opportunity-discovery] queued for harper_worker", {
      runId: run.id,
    });

    return NextResponse.json({
      ok: true,
      run: serializeOpportunityRun(run),
      runId: run.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create opportunity run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
