import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import {
  fetchTalentOpportunityHistoryByIds,
  fetchTalentOpportunityHistoryByRoleIds,
  fetchTalentOpportunityHistoryCounts,
  fetchTalentOpportunityHistoryPage,
  fetchTalentOpportunitySavedStageHistoryPages,
  type TalentOpportunityHistoryTab,
  type TalentOpportunitySavedStageFilter,
  type TalentOpportunitySavedStage,
  updateTalentOpportunityHistoryItem,
  type TalentOpportunityFeedback,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import { type TalentOpportunityFeedbackReplyTrigger } from "@/lib/career/historyActionReply";
import { insertTalentOpportunityFeedbackActivityEvent } from "@/lib/talentOnboarding/activityEvents";
import {
  buildOpportunityFeedbackNoteContent,
  TALENT_MESSAGE_TYPE_OPPORTUNITY_FEEDBACK_NOTE,
} from "@/lib/career/opportunityFeedbackNote";
import {
  getSlackActivityDeviceLabel,
  notifySlackActivity,
} from "@/lib/slackActivity";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";

const POSITION_TAB_INTERACTION_SOURCE = "position_tab";
const OPS_CAREER_URL = "https://matchharper.com/ops/career";
const IMMEDIATE_FEEDBACK_FOLLOW_UP_DELAY_MS = 500;
const DELAYED_FEEDBACK_FOLLOW_UP_DELAY_MS = 10_000;

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

const parseHistoryTabParam = (
  value: string | null
): TalentOpportunityHistoryTab | undefined => {
  if (value === "new" || value === "saved" || value === "archived") {
    return value;
  }
  return undefined;
};

const parseSavedStageParam = (
  value: string | null
): TalentOpportunitySavedStageFilter | undefined => {
  if (
    value === "all" ||
    value === "saved" ||
    value === "applied" ||
    value === "connected" ||
    value === "closed" ||
    value === "hidden"
  ) {
    return value;
  }
  return undefined;
};

const parseSavedStagesParam = (
  value: string | null
): TalentOpportunitySavedStage[] => {
  if (!value) return [];

  const stages: TalentOpportunitySavedStage[] = [];
  for (const rawStage of value.split(",")) {
    const savedStage = parseSavedStageParam(rawStage.trim());
    if (!savedStage || savedStage === "all") continue;
    if (!stages.includes(savedStage)) {
      stages.push(savedStage);
    }
  }
  return stages;
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

async function insertOpportunityFeedbackNoteMessage(args: {
  action: TalentOpportunityFeedback;
  admin: TalentAdminClient;
  conversationId: string | null;
  isMobile?: boolean | null;
  locale?: string | null;
  opportunity: TalentOpportunityHistoryItem | null;
  userId: string;
}) {
  const conversationId = String(args.conversationId ?? "").trim();
  if (!conversationId || !args.opportunity) {
    return null;
  }

  await assertConversationAccess({
    admin: args.admin,
    conversationId,
    userId: args.userId,
  });

  const { data, error } = await args.admin
    .from("talent_messages")
    .insert(
      withIsMobile(
        {
          conversation_id: conversationId,
          user_id: args.userId,
          role: "user",
          content: buildOpportunityFeedbackNoteContent({
            action: args.action,
            companyName: args.opportunity.companyName,
            locale: args.locale,
            sourceType: args.opportunity.sourceType,
            title: args.opportunity.title,
          }),
          message_type: TALENT_MESSAGE_TYPE_OPPORTUNITY_FEEDBACK_NOTE,
        },
        args.isMobile
      )
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to insert feedback note message");
  }

  return toTalentMessageResponse(data as TalentMessageRow);
}

function parseFeedbackReasonForSlack(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      customReason?: unknown;
      selectedOptions?: unknown;
    };
    const selectedOptions = Array.isArray(parsed.selectedOptions)
      ? parsed.selectedOptions
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];
    const customReason =
      typeof parsed.customReason === "string" ? parsed.customReason.trim() : "";
    return (
      [...selectedOptions, customReason].filter(Boolean).join(" / ") || null
    );
  } catch {
    return raw;
  }
}

function buildOpsCareerUserUrl(userId: string) {
  const url = new URL(OPS_CAREER_URL);
  url.searchParams.set("userId", userId);
  return url.toString();
}

async function notifyInternalPositionDecisionSlack(args: {
  decision: TalentOpportunityFeedback;
  deviceLabel?: string | null;
  feedbackReason?: string | null;
  interactionSource?: string | null;
  opportunity?: TalentOpportunityHistoryItem | null;
  user: User;
}) {
  if (args.interactionSource !== POSITION_TAB_INTERACTION_SOURCE) return;
  if (!args.opportunity || args.opportunity.sourceType !== "internal") return;

  const accepted = args.decision === "positive";
  const decisionLabel = accepted ? "accepted ☘️" : "rejected ❌";

  try {
    await notifySlackActivity({
      action: `Internal position ${decisionLabel}`,
      nameUrl: buildOpsCareerUserUrl(args.user.id),
      user: args.user,
      userId: args.user.id,
      details: [
        {
          label: "Decision",
          value: accepted ? "수락" : "거절" + "at 사이트내 포지션 탭",
        },
        { label: "Device", value: args.deviceLabel },
        { label: "Company", value: args.opportunity.companyName },
        { label: "Role", value: args.opportunity.title },
        { label: "Location", value: args.opportunity.location },
        { label: "Work Mode", value: args.opportunity.workMode },
        {
          label: "Feedback Reason",
          value: parseFeedbackReasonForSlack(args.feedbackReason),
        },
        { label: "Role ID", value: args.opportunity.roleId },
        { label: "User ID", value: args.user.id },
      ],
    });
  } catch (error) {
    console.error("[career-history:internal-position-slack]", {
      error: error instanceof Error ? error.message : String(error),
      opportunityId: args.opportunity.id,
      userId: args.user.id,
    });
  }
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
      10,
      100
    );
    const offset = parseOffsetParam(req.nextUrl.searchParams.get("offset"));
    const roleId = String(req.nextUrl.searchParams.get("id") ?? "").trim();
    const historyTab = parseHistoryTabParam(
      req.nextUrl.searchParams.get("historyTab")
    );
    const savedStage = parseSavedStageParam(
      req.nextUrl.searchParams.get("savedStage")
    );
    const savedStages = parseSavedStagesParam(
      req.nextUrl.searchParams.get("savedStages")
    );

    if (roleId) {
      const items = await fetchTalentOpportunityHistoryByRoleIds({
        admin,
        roleIds: [roleId],
        userId: user.id,
      });

      return NextResponse.json({
        counts: null,
        items,
        limit: 1,
        nextOffset: null,
        offset: 0,
        ok: true,
      });
    }

    if (historyTab === "saved" && savedStages.length > 0) {
      const stagePages = await fetchTalentOpportunitySavedStageHistoryPages({
        admin,
        limit,
        offset,
        savedStages,
        userId: user.id,
      });

      return NextResponse.json({
        counts: stagePages.counts,
        ok: true,
        savedStagePages: stagePages.pages,
      });
    }

    const page = await fetchTalentOpportunityHistoryPage({
      admin,
      historyTab,
      limit,
      offset,
      savedStage,
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
      action?: "feedback" | "saved_stage" | "view" | "click" | "memo";
      feedback?: TalentOpportunityFeedback | null;
      feedbackReason?: string | null;
      conversationId?: string | null;
      interactionSource?: string | null;
      locale?: string | null;
      opportunityId?: string;
      promptImmediately?: boolean;
      savedStage?: TalentOpportunitySavedStage | null;
      talentMemo?: string | null;
    };
    const isMobile = isMobileRequest(req);

    const action = body.action;
    if (
      action !== "feedback" &&
      action !== "saved_stage" &&
      action !== "view" &&
      action !== "click" &&
      action !== "memo"
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
      body.savedStage !== "closed" &&
      body.savedStage !== "hidden"
    ) {
      return NextResponse.json(
        { error: "Invalid savedStage" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const talentSetting =
      action === "feedback"
        ? await fetchTalentSetting({
            admin,
            userId: user.id,
          })
        : null;
    const responseLocale =
      talentSetting?.preferred_locale ??
      body.locale ??
      req.cookies.get("NEXT_LOCALE")?.value ??
      null;
    let previousOpportunity: TalentOpportunityHistoryItem | null = null;
    if (action === "feedback" || action === "saved_stage") {
      try {
        const previousOpportunities = await fetchTalentOpportunityHistoryByIds({
          admin,
          ids: [opportunityId],
          userId: user.id,
        });
        previousOpportunity = previousOpportunities[0] ?? null;
      } catch (lookupError) {
        if (action === "saved_stage") {
          throw lookupError;
        }
        console.warn("[career-history:previous-opportunity]", {
          error:
            lookupError instanceof Error
              ? lookupError.message
              : String(lookupError),
          opportunityId,
          userId: user.id,
        });
      }
    }

    if (
      previousOpportunity?.sourceType === "internal" &&
      action === "saved_stage"
    ) {
      return NextResponse.json(
        { error: "Internal role status cannot be changed." },
        { status: 403 }
      );
    }

    if (
      previousOpportunity?.sourceType === "internal" &&
      action === "feedback" &&
      previousOpportunity.feedback !== null
    ) {
      return NextResponse.json(
        { error: "Internal role status cannot be changed." },
        { status: 403 }
      );
    }

    const savedStageForUpdate =
      action === "feedback" &&
      body.feedback === "positive" &&
      previousOpportunity?.sourceType === "internal"
        ? "connected"
        : body.savedStage;

    const result = await updateTalentOpportunityHistoryItem({
      action,
      admin,
      feedback: body.feedback,
      feedbackReason: body.feedbackReason,
      opportunityId,
      savedStage: savedStageForUpdate,
      talentMemo: body.talentMemo,
      userId: user.id,
    });
    const [updatedOpportunity] = await fetchTalentOpportunityHistoryByIds({
      admin,
      ids: [result.opportunityId ?? opportunityId],
      userId: user.id,
    });
    let historyCounts: Awaited<
      ReturnType<typeof fetchTalentOpportunityHistoryCounts>
    > | null = null;
    if (action === "feedback" && body.feedback) {
      try {
        historyCounts = await fetchTalentOpportunityHistoryCounts({
          admin,
          userId: user.id,
        });
      } catch (countError) {
        console.warn("[career-history:feedback-counts]", {
          error:
            countError instanceof Error
              ? countError.message
              : String(countError),
          opportunityId,
          userId: user.id,
        });
      }
    }
    const shouldPromptAfterClearedPositionTab =
      action === "feedback" &&
      (body.feedback === "positive" || body.feedback === "negative") &&
      body.interactionSource === POSITION_TAB_INTERACTION_SOURCE &&
      (previousOpportunity?.feedback === null ||
        body.promptImmediately === true) &&
      historyCounts?.new === 0;

    let userMessage: Awaited<
      ReturnType<typeof insertOpportunityFeedbackNoteMessage>
    > | null = null;
    const conversationId = String(body.conversationId ?? "").trim() || null;
    let shouldScheduleDelayedFollowUp = false;
    let feedbackFollowUpTrigger: TalentOpportunityFeedbackReplyTrigger | null =
      null;
    let feedbackFollowUpDelayMs: number | null = null;
    let feedbackFollowUpOpportunityId: string | null = null;
    let shouldCreateInternalCallRequestOnFollowUp = false;
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
          activityInserted = await insertTalentOpportunityFeedbackActivityEvent(
            {
              action: body.feedback,
              admin,
              conversationId,
              feedbackReason: body.feedbackReason ?? null,
              opportunity,
              userId: user.id,
            }
          );
        }
        try {
          userMessage = await insertOpportunityFeedbackNoteMessage({
            action: body.feedback,
            admin,
            conversationId,
            isMobile,
            locale: responseLocale,
            opportunity: opportunity ?? null,
            userId: user.id,
          });
        } catch (noteError) {
          console.error("[career-history:feedback-note]", {
            error:
              noteError instanceof Error
                ? noteError.message
                : String(noteError),
            opportunityId,
            userId: user.id,
          });
        }
        shouldScheduleDelayedFollowUp =
          activityInserted && opportunity?.sourceType === "external";
        if (
          opportunity?.sourceType === "internal" &&
          body.feedback === "positive"
        ) {
          shouldCreateInternalCallRequestOnFollowUp = true;
        }

        const isInternalAcceptance =
          opportunity?.sourceType === "internal" &&
          body.feedback === "positive";
        feedbackFollowUpTrigger = isInternalAcceptance
          ? "immediate_internal_feedback"
          : shouldPromptAfterClearedPositionTab
            ? "all_recommended_opportunities_cleared"
            : opportunity?.sourceType === "internal"
              ? "immediate_internal_feedback"
              : body.promptImmediately === true
                ? "all_visible_feedback_submitted"
                : shouldScheduleDelayedFollowUp
                  ? "delayed_external_feedback"
                  : null;
        feedbackFollowUpDelayMs = feedbackFollowUpTrigger
          ? feedbackFollowUpTrigger === "delayed_external_feedback"
            ? DELAYED_FEEDBACK_FOLLOW_UP_DELAY_MS
            : IMMEDIATE_FEEDBACK_FOLLOW_UP_DELAY_MS
          : null;
        feedbackFollowUpOpportunityId = opportunity?.id ?? null;
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

    if (action === "feedback" && body.feedback) {
      await notifyInternalPositionDecisionSlack({
        decision: body.feedback,
        deviceLabel: getSlackActivityDeviceLabel(req),
        feedbackReason: body.feedbackReason ?? null,
        interactionSource: body.interactionSource ?? null,
        opportunity: updatedOpportunity ?? null,
        user,
      });
    }

    return NextResponse.json({
      ...result,
      assistantMessage: null,
      feedbackFollowUp: {
        delayed:
          feedbackFollowUpTrigger === "delayed_external_feedback" &&
          feedbackFollowUpDelayMs !== null,
        delayMs: feedbackFollowUpDelayMs,
        feedback: body.feedback ?? null,
        immediate:
          feedbackFollowUpTrigger !== null &&
          feedbackFollowUpTrigger !== "delayed_external_feedback",
        opportunityId: feedbackFollowUpOpportunityId,
        shouldCreateInternalCallRequest:
          shouldCreateInternalCallRequestOnFollowUp,
        trigger: feedbackFollowUpTrigger,
      },
      followUpRunId: null,
      counts: historyCounts,
      historyShouldRefresh: shouldPromptAfterClearedPositionTab,
      opportunity: updatedOpportunity ?? null,
      opportunityDiscoveryQueued: false,
      userMessage,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update opportunity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
