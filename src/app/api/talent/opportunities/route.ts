import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  fetchTalentOpportunityHistory,
  type TalentOpportunitySavedStage,
  updateTalentOpportunityHistoryItem,
  type TalentOpportunityFeedback,
} from "@/lib/talentOpportunity";
import {
  createOpportunityDiscoveryRun,
  getActiveOpportunityRun,
} from "@/lib/opportunityDiscovery/store";

function startOpportunityDiscoveryInBackground(runId: string) {
  console.info("[opportunity-discovery] queued for harper_worker", {
    runId,
  });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const items = await fetchTalentOpportunityHistory({
      admin,
      userId: user.id,
    });

    return NextResponse.json({ items, ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load opportunities";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: "feedback" | "saved_stage" | "view" | "click";
      feedback?: TalentOpportunityFeedback | null;
      feedbackReason?: string | null;
      opportunityId?: string;
      savedStage?: TalentOpportunitySavedStage | null;
    };

    const action = body.action;
    if (
      action !== "feedback" &&
      action !== "saved_stage" &&
      action !== "view" &&
      action !== "click"
    ) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const opportunityId = String(body.opportunityId ?? "").trim();
    if (!opportunityId) {
      return NextResponse.json(
        { error: "opportunityId is required" },
        { status: 400 }
      );
    }

    if (
      action === "feedback" &&
      body.feedback !== "positive" &&
      body.feedback !== "negative" &&
      body.feedback !== null
    ) {
      return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
    }

    if (
      action === "saved_stage" &&
      body.savedStage !== "saved" &&
      body.savedStage !== "applied" &&
      body.savedStage !== "connected" &&
      body.savedStage !== "closed"
    ) {
      return NextResponse.json(
        { error: "Invalid savedStage" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const result = await updateTalentOpportunityHistoryItem({
      action,
      admin,
      feedback: body.feedback,
      feedbackReason: body.feedbackReason,
      opportunityId,
      savedStage: body.savedStage,
      userId: user.id,
    });

    let followUpRunId: string | null = null;
    if (action === "feedback" && body.feedback) {
      const { data: recommendation } = await ((
        admin.from("talent_opportunity_recommendation" as any) as any
      )
        .select("discovery_run_id")
        .eq("talent_id", user.id)
        .eq("id", opportunityId)
        .maybeSingle() as any);

      const sourceRunId =
        typeof recommendation?.discovery_run_id === "string"
          ? recommendation.discovery_run_id
          : "";

      if (sourceRunId) {
        const { data: missingFeedback } = await ((
          admin.from("talent_opportunity_recommendation" as any) as any
        )
          .select("id")
          .eq("talent_id", user.id)
          .eq("discovery_run_id", sourceRunId)
          .is("feedback_at", null)
          .limit(1) as any);

        if (!Array.isArray(missingFeedback) || missingFeedback.length === 0) {
          const { data: sourceRun } = await ((
            admin.from("opportunity_discovery_run" as any) as any
          )
            .select("conversation_id")
            .eq("id", sourceRunId)
            .maybeSingle() as any);
          const conversationId =
            typeof sourceRun?.conversation_id === "string"
              ? sourceRun.conversation_id
              : null;
          const activeRun = conversationId
            ? await getActiveOpportunityRun({
                admin,
                conversationId,
                userId: user.id,
              })
            : null;

          if (!activeRun) {
            const run = await createOpportunityDiscoveryRun({
              admin,
              chatPreviewCount: conversationId ? 3 : 0,
              conversationId,
              talentId: user.id,
              trigger: "all_batch_feedback_submitted",
              triggerPayload: {
                sourceRunId,
              },
            });
            followUpRunId = run.id;
            startOpportunityDiscoveryInBackground(run.id);
          }
        }
      }
    }

    return NextResponse.json({ ...result, followUpRunId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update opportunity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
