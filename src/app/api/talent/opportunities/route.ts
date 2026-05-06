import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import {
  fetchTalentOpportunityHistoryByIds,
  fetchTalentOpportunityHistoryPage,
  type TalentOpportunitySavedStage,
  updateTalentOpportunityHistoryItem,
  type TalentOpportunityFeedback,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import {
  createTalentOpportunityFeedbackFollowUpReply,
  type TalentOpportunityFeedbackReplyTrigger,
} from "@/lib/career/historyActionReply";
import { insertTalentOpportunityFeedbackActivityEvent } from "@/lib/talentOnboarding/activityEvents";
import {
  buildOpportunityFeedbackNoteContent,
  TALENT_MESSAGE_TYPE_OPPORTUNITY_FEEDBACK_NOTE,
} from "@/lib/career/opportunityFeedbackNote";

const parsePositiveIntegerParam = (
  value: string | null,
  fallback: number,
  max: number
) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
};

const parseOffsetParam = (value: string | null) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

async function assertConversationAccess(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_conversations")
    .select("id")
    .eq("id", args.conversationId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read conversation");
  }
  if (!data) {
    throw new Error("Conversation not found");
  }
}

async function insertExternalOpportunityFeedbackNoteMessage(args: {
  action: TalentOpportunityFeedback;
  admin: TalentAdminClient;
  conversationId: string | null;
  opportunity: TalentOpportunityHistoryItem | null;
  userId: string;
}) {
  const conversationId = String(args.conversationId ?? "").trim();
  if (!conversationId || args.opportunity?.sourceType !== "external") {
    return null;
  }

  await assertConversationAccess({
    admin: args.admin,
    conversationId,
    userId: args.userId,
  });

  const { data, error } = await args.admin
    .from("talent_messages")
    .insert({
      conversation_id: conversationId,
      user_id: args.userId,
      role: "user",
      content: buildOpportunityFeedbackNoteContent({
        action: args.action,
        companyName: args.opportunity.companyName,
        title: args.opportunity.title,
      }),
      message_type: TALENT_MESSAGE_TYPE_OPPORTUNITY_FEEDBACK_NOTE,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to insert feedback note message");
  }

  return toTalentMessageResponse(data as TalentMessageRow);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const limit = parsePositiveIntegerParam(
      req.nextUrl.searchParams.get("limit"),
      20,
      100
    );
    const offset = parseOffsetParam(req.nextUrl.searchParams.get("offset"));
    const page = await fetchTalentOpportunityHistoryPage({
      admin,
      limit,
      offset,
      userId: user.id,
    });

    return NextResponse.json({ ...page, ok: true });
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
      conversationId?: string | null;
      opportunityId?: string;
      promptImmediately?: boolean;
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

    let assistantMessage: Awaited<
      ReturnType<typeof createTalentOpportunityFeedbackFollowUpReply>
    > | null = null;
    let userMessage: Awaited<
      ReturnType<typeof insertExternalOpportunityFeedbackNoteMessage>
    > | null = null;
    const conversationId = String(body.conversationId ?? "").trim() || null;
    let shouldScheduleDelayedFollowUp = false;
    if (
      action === "feedback" &&
      (body.feedback === "positive" || body.feedback === "negative") &&
      conversationId
    ) {
      try {
        const [opportunity] = await fetchTalentOpportunityHistoryByIds({
          admin,
          ids: [result.opportunityId ?? opportunityId],
          userId: user.id,
        });

        let activityInserted = false;
        if (opportunity) {
          activityInserted = await insertTalentOpportunityFeedbackActivityEvent({
            action: body.feedback,
            admin,
            conversationId,
            feedbackReason: body.feedbackReason ?? null,
            opportunity,
            userId: user.id,
          });
        }
        try {
          userMessage = await insertExternalOpportunityFeedbackNoteMessage({
            action: body.feedback,
            admin,
            conversationId,
            opportunity: opportunity ?? null,
            userId: user.id,
          });
        } catch (noteError) {
          console.error("[career-history:feedback-note]", {
            error:
              noteError instanceof Error ? noteError.message : String(noteError),
            opportunityId,
            userId: user.id,
          });
        }
        shouldScheduleDelayedFollowUp =
          activityInserted && opportunity?.sourceType === "external";

        const replyTrigger: TalentOpportunityFeedbackReplyTrigger | null =
          opportunity?.sourceType === "internal"
            ? "immediate_internal_feedback"
            : body.promptImmediately === true
              ? "all_visible_feedback_submitted"
              : null;

        assistantMessage = replyTrigger
          ? await createTalentOpportunityFeedbackFollowUpReply({
              action: body.feedback,
              admin,
              conversationId,
              feedbackReason: body.feedbackReason ?? null,
              opportunity: opportunity ?? null,
              trigger: replyTrigger,
              userId: user.id,
            })
          : null;
      } catch (replyError) {
        console.error("[career-history:feedback-follow-up]", {
          error:
            replyError instanceof Error
              ? replyError.message
              : String(replyError),
          opportunityId,
          userId: user.id,
        });
      }
    }

    return NextResponse.json({
      ...result,
      assistantMessage,
      feedbackFollowUp: {
        delayed: shouldScheduleDelayedFollowUp && !assistantMessage,
      },
      followUpRunId: null,
      opportunityDiscoveryQueued: false,
      userMessage,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update opportunity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
