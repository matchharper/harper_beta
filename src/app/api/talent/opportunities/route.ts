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
  archiveEndedInternalOpportunitiesForTalent,
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
import { CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER } from "@/lib/career/prompts/types";
import {
  buildOpsCareerUserUrl,
  getInternalOpportunityDecisionSlackChannelId,
  notifyInternalOpportunityDecisionSlack,
} from "@/lib/internalOpportunityDecisionSlack";
import {
  getInternalOpportunityDecisionAvailability,
  normalizeInternalOpportunityDecisionReason,
  type CareerInternalOpportunityDecisionAction,
} from "@/lib/career/internalOpportunityDecision";
import { fetchPendingInternalOpportunityCallRequests } from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import { careerT } from "@/lib/career/translatedCareerMessage";

const POSITION_TAB_INTERACTION_SOURCE = "position_tab";
const IMMEDIATE_FEEDBACK_FOLLOW_UP_DELAY_MS = 500;
const DELAYED_FEEDBACK_FOLLOW_UP_DELAY_MS = 10_000;
const FEEDBACK_FOLLOW_UP_TRIGGER =
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER;

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

async function notifyInternalPositionDecisionChangeSlack(args: {
  action: CareerInternalOpportunityDecisionAction;
  admin: TalentAdminClient;
  deviceLabel?: string | null;
  opportunity: TalentOpportunityHistoryItem;
  previousFeedback: TalentOpportunityFeedback;
  reason?: string | null;
  user: User;
}) {
  const isRevert = args.action === "revert";
  const actionLabel = isRevert
    ? args.previousFeedback === "positive"
      ? "Internal position acceptance reverted ↩️"
      : "Internal position rejection reverted ↩️"
    : "Internal position process stopped ⛔";
  const resultLabel = isRevert
    ? "결정 취소 · 새 포지션으로 되돌림"
    : "후보자 요청으로 진행 중단";
  const previousStage =
    args.opportunity.internalProgress?.stage ??
    (args.previousFeedback === "positive" ? "accepted" : "rejected");
  const opsFollowUp = isRevert
    ? args.previousFeedback === "positive"
      ? "회사 전달 여부를 확인하고, 이미 전달됐다면 필요한 후속 조치를 진행해 주세요."
      : "거절 상태가 해제되었습니다."
    : "회사 연락 또는 일정 진행 여부를 확인하고 중단 의사를 전달해 주세요.";

  try {
    const { data: role, error: roleError } = await args.admin
      .from("company_roles")
      .select("company_workspace_id")
      .eq("role_id", args.opportunity.roleId)
      .maybeSingle();
    if (roleError) {
      throw new Error(
        roleError.message ?? "Failed to resolve opportunity workspace"
      );
    }

    await notifySlackActivity({
      action: actionLabel,
      channelId: getInternalOpportunityDecisionSlackChannelId(
        role?.company_workspace_id
      ),
      nameUrl: buildOpsCareerUserUrl(args.user.id),
      user: args.user,
      userId: args.user.id,
      details: [
        {
          label: "Previous decision",
          value: args.previousFeedback === "positive" ? "수락" : "거절",
        },
        { label: "Previous stage", value: previousStage },
        { label: "Result", value: resultLabel },
        { label: "Ops follow-up", value: opsFollowUp },
        ...(args.action === "stop_process"
          ? [
              {
                label: "Stop reason",
                value: args.reason ?? "미입력",
              },
            ]
          : []),
        { label: "Source", value: `/career 포지션 탭, ${args.deviceLabel}` },
        { label: "Company", value: args.opportunity.companyName },
        { label: "Role", value: args.opportunity.title },
        { label: "Location", value: args.opportunity.location },
      ],
    });
  } catch (error) {
    console.error("[career-history:internal-position-change-slack]", {
      action: args.action,
      error: error instanceof Error ? error.message : String(error),
      opportunityId: args.opportunity.id,
      userId: args.user.id,
    });
  }
}

function getInternalDecisionChangeErrorMessage(
  errorMessage: string,
  locale?: string | null
) {
  if (errorMessage.includes("internal_acceptance_revert_window_expired")) {
    return careerT(
      locale,
      "career.api.opportunities.internal_revert_expired",
      "수락 후 24시간이 지나 되돌릴 수 없습니다."
    );
  }
  if (errorMessage.includes("internal_acceptance_already_progressed")) {
    return careerT(
      locale,
      "career.api.opportunities.internal_revert_progressed",
      "이미 회사 전달 또는 후속 단계가 시작되어 수락을 되돌릴 수 없습니다."
    );
  }
  if (errorMessage.includes("ended_internal_role_cannot_be_reverted")) {
    return careerT(
      locale,
      "career.api.opportunities.ended_rejection_revert_forbidden",
      "이미 종료된 포지션이라 거절을 되돌릴 수 없습니다."
    );
  }
  if (errorMessage.includes("internal_process_already_closed")) {
    return careerT(
      locale,
      "career.api.opportunities.internal_process_closed",
      "이미 종료된 프로세스입니다."
    );
  }
  if (errorMessage.includes("only_accepted_internal_role_can_be_stopped")) {
    return careerT(
      locale,
      "career.api.opportunities.only_accepted_can_stop",
      "수락하여 진행 중인 포지션만 중단할 수 있습니다."
    );
  }
  if (errorMessage.includes("internal_decision_cannot_be_reverted")) {
    return careerT(
      locale,
      "career.api.opportunities.internal_decision_revert_forbidden",
      "현재 상태에서는 결정을 되돌릴 수 없습니다."
    );
  }
  if (errorMessage.includes("internal_opportunity_not_found")) {
    return careerT(
      locale,
      "career.api.opportunities.internal_opportunity_not_found",
      "포지션을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요."
    );
  }
  return null;
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
    const latestFirst =
      req.nextUrl.searchParams.get("sort") === "recommended_at_desc";
    const locale =
      req.nextUrl.searchParams.get("locale") ??
      req.cookies.get("NEXT_LOCALE")?.value ??
      null;

    if (roleId) {
      await archiveEndedInternalOpportunitiesForTalent({
        admin,
        locale,
        userId: user.id,
      });
      const items = await fetchTalentOpportunityHistoryByRoleIds({
        admin,
        includeActivityTimeline: true,
        locale,
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
        locale,
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
      latestFirst,
      limit,
      locale,
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
      action?:
        | "feedback"
        | "saved_stage"
        | "view"
        | "click"
        | "memo"
        | "internal_decision_change";
      feedback?: TalentOpportunityFeedback | null;
      feedbackReason?: string | null;
      conversationId?: string | null;
      internalDecisionAction?: CareerInternalOpportunityDecisionAction;
      internalDecisionReason?: string | null;
      interactionSource?: string | null;
      locale?: string | null;
      opportunityId?: string;
      promptImmediately?: boolean;
      savedStage?: TalentOpportunitySavedStage | null;
      suppressNonPriorityFeedbackFollowUp?: boolean;
      talentMemo?: string | null;
    };
    const isMobile = isMobileRequest(req);

    const action = body.action;
    if (
      action !== "feedback" &&
      action !== "saved_stage" &&
      action !== "view" &&
      action !== "click" &&
      action !== "memo" &&
      action !== "internal_decision_change"
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

    if (
      action === "memo" &&
      (!String(body.talentMemo ?? "").trim() ||
        String(body.talentMemo ?? "").trim().length > 10_000)
    ) {
      return NextResponse.json(
        { error: "Memo must be between 1 and 10,000 characters." },
        { status: 400 }
      );
    }

    if (
      action === "internal_decision_change" &&
      body.internalDecisionAction !== "revert" &&
      body.internalDecisionAction !== "stop_process"
    ) {
      return NextResponse.json(
        { error: "Invalid internalDecisionAction" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const talentSetting =
      action === "feedback" || action === "internal_decision_change"
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
    if (
      action === "feedback" ||
      action === "saved_stage" ||
      action === "internal_decision_change"
    ) {
      try {
        const previousOpportunities = await fetchTalentOpportunityHistoryByIds({
          admin,
          ids: [opportunityId],
          userId: user.id,
        });
        previousOpportunity = previousOpportunities[0] ?? null;
      } catch (lookupError) {
        if (action === "saved_stage" || action === "internal_decision_change") {
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

    if (action === "internal_decision_change") {
      if (
        !previousOpportunity ||
        previousOpportunity.sourceType !== "internal"
      ) {
        return NextResponse.json(
          { error: "Internal role not found." },
          { status: 404 }
        );
      }

      const internalDecisionAction = body.internalDecisionAction!;
      const internalDecisionReason =
        internalDecisionAction === "stop_process"
          ? normalizeInternalOpportunityDecisionReason(
              body.internalDecisionReason
            )
          : null;
      const availability =
        getInternalOpportunityDecisionAvailability(previousOpportunity);
      const allowed =
        internalDecisionAction === "revert"
          ? availability.canRevert
          : availability.canStopProcess;
      if (!allowed) {
        const error =
          internalDecisionAction === "revert" &&
          previousOpportunity.feedback === "negative" &&
          previousOpportunity.status.trim().toLowerCase() === "ended"
            ? careerT(
                responseLocale,
                "career.api.opportunities.ended_rejection_revert_forbidden",
                "이미 종료된 포지션이라 거절을 되돌릴 수 없습니다."
              )
            : internalDecisionAction === "revert"
              ? careerT(
                  responseLocale,
                  "career.api.opportunities.internal_revert_unavailable",
                  "수락 후 24시간이 지났거나 이미 후속 단계가 시작되어 되돌릴 수 없습니다."
                )
              : careerT(
                  responseLocale,
                  "career.api.opportunities.internal_stop_unavailable",
                  "현재 상태에서는 진행을 중단할 수 없습니다."
                );
        return NextResponse.json({ error }, { status: 409 });
      }

      const previousFeedback = previousOpportunity.feedback;
      if (!previousFeedback) {
        return NextResponse.json(
          {
            error: careerT(
              responseLocale,
              "career.api.opportunities.internal_decision_missing",
              "되돌리거나 중단할 결정이 없습니다."
            ),
          },
          { status: 409 }
        );
      }

      const changedAt = new Date().toISOString();
      const { error: changeError } = await admin.rpc(
        "change_internal_talent_opportunity_decision",
        {
          p_action: internalDecisionAction,
          p_changed_at: changedAt,
          p_reason: internalDecisionReason,
          p_recommendation_id: previousOpportunity.id,
          p_talent_id: user.id,
        }
      );
      if (changeError) {
        const errorMessage = String(changeError.message ?? "");
        const userMessage = getInternalDecisionChangeErrorMessage(
          errorMessage,
          responseLocale
        );
        if (!userMessage) {
          console.error("[career-history:internal-decision-change]", {
            action: internalDecisionAction,
            error: errorMessage,
            opportunityId,
            userId: user.id,
          });
        }
        return NextResponse.json(
          {
            error:
              userMessage ??
              careerT(
                responseLocale,
                "career.api.opportunities.internal_status_update_failed",
                "상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요."
              ),
          },
          { status: userMessage ? 409 : 500 }
        );
      }

      let updatedOpportunity: TalentOpportunityHistoryItem | null = null;
      let historyCounts: Awaited<
        ReturnType<typeof fetchTalentOpportunityHistoryCounts>
      > | null = null;
      let pendingInternalOpportunityCallRequests: Awaited<
        ReturnType<typeof fetchPendingInternalOpportunityCallRequests>
      > | null = null;
      try {
        [updatedOpportunity] = await fetchTalentOpportunityHistoryByIds({
          admin,
          ids: [previousOpportunity.id],
          locale: responseLocale,
          userId: user.id,
        });
      } catch (refreshError) {
        console.warn("[career-history:internal-decision-refresh]", {
          error:
            refreshError instanceof Error
              ? refreshError.message
              : String(refreshError),
          opportunityId,
          userId: user.id,
        });
      }
      try {
        historyCounts = await fetchTalentOpportunityHistoryCounts({
          admin,
          userId: user.id,
        });
      } catch (countError) {
        console.warn("[career-history:internal-decision-counts]", {
          error:
            countError instanceof Error
              ? countError.message
              : String(countError),
          opportunityId,
          userId: user.id,
        });
      }
      try {
        pendingInternalOpportunityCallRequests =
          await fetchPendingInternalOpportunityCallRequests({
            admin,
            userId: user.id,
          });
      } catch (callRequestError) {
        console.warn("[career-history:internal-decision-call-requests]", {
          error:
            callRequestError instanceof Error
              ? callRequestError.message
              : String(callRequestError),
          opportunityId,
          userId: user.id,
        });
      }

      await notifyInternalPositionDecisionChangeSlack({
        action: internalDecisionAction,
        admin,
        deviceLabel: getSlackActivityDeviceLabel(req),
        opportunity: previousOpportunity,
        previousFeedback,
        reason: internalDecisionReason,
        user,
      });

      return NextResponse.json({
        counts: historyCounts,
        historyShouldRefresh: true,
        ok: true,
        opportunity: updatedOpportunity,
        pendingInternalOpportunityCallRequests,
        updatedAt: changedAt,
      });
    }

    if (
      action === "feedback" &&
      body.feedback === "positive" &&
      previousOpportunity?.sourceType === "internal" &&
      previousOpportunity.status.trim().toLowerCase() === "ended"
    ) {
      return NextResponse.json(
        {
          error: careerT(
            responseLocale,
            "career.api.opportunities.ended_acceptance_forbidden",
            "이미 종료된 포지션이라 연결을 수락할 수 없습니다."
          ),
        },
        { status: 409 }
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
      clearEmailAcceptanceConfirmation:
        action === "feedback" && previousOpportunity?.sourceType === "internal",
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
      includeActivityTimeline:
        action === "memo" || action === "saved_stage" || action === "feedback",
      locale: responseLocale,
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
          locale: responseLocale,
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
          ? FEEDBACK_FOLLOW_UP_TRIGGER.ImmediateInternalFeedback
          : shouldPromptAfterClearedPositionTab
            ? FEEDBACK_FOLLOW_UP_TRIGGER.AllRecommendedOpportunitiesCleared
            : opportunity?.sourceType === "internal"
              ? FEEDBACK_FOLLOW_UP_TRIGGER.ImmediateInternalFeedback
              : shouldScheduleDelayedFollowUp
                ? FEEDBACK_FOLLOW_UP_TRIGGER.DelayedExternalFeedback
                : null;
        feedbackFollowUpDelayMs = feedbackFollowUpTrigger
          ? feedbackFollowUpTrigger ===
            FEEDBACK_FOLLOW_UP_TRIGGER.DelayedExternalFeedback
            ? body.promptImmediately === true
              ? IMMEDIATE_FEEDBACK_FOLLOW_UP_DELAY_MS
              : DELAYED_FEEDBACK_FOLLOW_UP_DELAY_MS
            : IMMEDIATE_FEEDBACK_FOLLOW_UP_DELAY_MS
          : null;
        feedbackFollowUpOpportunityId = opportunity?.id ?? null;

        if (
          body.suppressNonPriorityFeedbackFollowUp === true &&
          !isInternalAcceptance &&
          !shouldPromptAfterClearedPositionTab
        ) {
          feedbackFollowUpTrigger = null;
          feedbackFollowUpDelayMs = null;
          feedbackFollowUpOpportunityId = null;
        }
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

    if (
      action === "feedback" &&
      body.feedback &&
      body.interactionSource === POSITION_TAB_INTERACTION_SOURCE
    ) {
      await notifyInternalOpportunityDecisionSlack({
        admin,
        decision: body.feedback,
        deviceLabel: getSlackActivityDeviceLabel(req),
        feedbackReason: body.feedbackReason ?? null,
        opportunity: updatedOpportunity ?? null,
        sourceLabel: "/career 포지션 탭",
        user,
        userId: user.id,
      });
    }

    return NextResponse.json({
      ...result,
      assistantMessage: null,
      feedbackFollowUp: {
        delayed:
          feedbackFollowUpTrigger ===
            FEEDBACK_FOLLOW_UP_TRIGGER.DelayedExternalFeedback &&
          feedbackFollowUpDelayMs !== null,
        delayMs: feedbackFollowUpDelayMs,
        feedback: body.feedback ?? null,
        immediate:
          feedbackFollowUpTrigger !== null &&
          feedbackFollowUpTrigger !==
            FEEDBACK_FOLLOW_UP_TRIGGER.DelayedExternalFeedback,
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
