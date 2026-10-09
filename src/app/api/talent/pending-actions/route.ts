import { NextRequest, NextResponse } from "next/server";
import { readPriorityReviewProgress } from "@/lib/career/priorityReviewProgress";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { fetchPendingInternalOpportunityCallRequests } from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import { fetchActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import {
  createCompanyTalentResumeUploadToken,
  fetchActiveCompanyTalentRequests,
  getCompanyTalentRequestLogoUrl,
} from "@/lib/companyTalentRequests/server";
import { fetchTalentOpportunityHistory } from "@/lib/talentOpportunity";
import { fetchCareerExternalFeedbackSuggestions } from "@/lib/career/taskSuggestions.server";
import { fetchCareerRecentInfoPage } from "@/lib/career/recentTaskInfo.server";
import type {
  CareerPendingAction,
  CareerReengagementPendingActionsSnapshot,
} from "@/lib/career/pendingActions";
import { fetchCareerReengagementPendingActions } from "@/lib/career/reengagementPendingActions.server";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { fetchOpenCareerCheckInCall } from "@/lib/talentOnboarding/careerCheckInCall";
import { fetchPendingTalentMeetingSchedules } from "@/lib/meetings/talentPendingMeeting.server";
import { isInternalRoleCandidateDecisionAvailable } from "@/lib/career/internalOpportunityDecision";
import { OpportunityType } from "@/lib/opportunityType";
import {
  getCareerWaitingConnection,
  type CareerExternalFeedbackSnapshot,
  type CareerPendingActionsSnapshot,
  type CareerTaskProgressSnapshot,
  type CareerRecentInfoPage,
} from "@/lib/career/taskItems";

const cleanText = (value: unknown, fallback: string, maxLength = 1000) => {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, maxLength);
};

export async function DELETE(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roleId = req.nextUrl.searchParams.get("priorityReviewRoleId");
  if (!roleId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roleId)) {
    return NextResponse.json({ error: "Invalid role ID" }, { status: 400 });
  }
  const admin = getTalentSupabaseAdmin();
  const { data, error } = await (admin.rpc as any)("withdraw_candidate_priority_review_v1", {
    p_talent_id: user.id,
    p_role_id: roleId,
    p_source: { source: "career_tasks" },
  });
  if (error) {
    console.error("[CareerPriorityReview] Withdrawal failed", error);
    return NextResponse.json({ error: "Could not withdraw request" }, { status: 500 });
  }
  return NextResponse.json(data);
}

async function withPendingActionsFallback<T>(args: {
  fallback: T;
  label: string;
  promise: Promise<T>;
  userId: string;
  unavailableCategories: string[];
}) {
  try {
    return await args.promise;
  } catch (error) {
    args.unavailableCategories.push(args.label);
    console.error("[CareerPendingActions] Failed to load category", {
      error: error instanceof Error ? error.message : String(error),
      label: args.label,
      userId: args.userId,
    });
    return args.fallback;
  }
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getTalentSupabaseAdmin();
  if (req.nextUrl.searchParams.get("scope") === "external-feedback") {
    try {
      const externalFeedback = await fetchCareerExternalFeedbackSuggestions({
        admin,
        userId: user.id,
      });
      return NextResponse.json({
        externalFeedback,
      } satisfies CareerExternalFeedbackSnapshot);
    } catch (error) {
      console.error(
        "[CareerTaskSuggestions] Failed to load recommendations",
        error
      );
      return NextResponse.json(
        { error: "Failed to load recommendation feedback suggestions" },
        { status: 500 }
      );
    }
  }
  const setting = await fetchTalentSetting({ admin, userId: user.id });
  const isReengagementScope =
    req.nextUrl.searchParams.get("scope") === "reengagement";
  const isProgressScope = req.nextUrl.searchParams.get("scope") === "progress";
  const isRecentInfoScope = req.nextUrl.searchParams.get("scope") === "recent-info";
  if (!setting?.is_onboarding_done) {
    if (isRecentInfoScope) {
      return NextResponse.json({ items: [], nextCursor: null } satisfies CareerRecentInfoPage);
    }
    if (isReengagementScope) {
      return NextResponse.json({
        actions: [],
        promptActions: [],
      } satisfies CareerReengagementPendingActionsSnapshot);
    }
    if (isProgressScope) {
      return NextResponse.json({
        connections: [],
        searchStatus: setting?.status ?? null,
      });
    }
    return NextResponse.json({
      actions: [],
      meetingSchedules: [],
      unavailableCategories: [],
    } satisfies CareerPendingActionsSnapshot);
  }

  const locale =
    req.nextUrl.searchParams.get("locale") ?? setting.preferred_locale;
  if (isRecentInfoScope) {
    const beforeAt = req.nextUrl.searchParams.get("beforeAt");
    const beforeId = req.nextUrl.searchParams.get("beforeId");
    if ((beforeAt !== null || beforeId !== null) &&
      (!beforeAt || beforeId === null || !Number.isFinite(Date.parse(beforeAt)) ||
        (beforeId !== "" && !/^(contact|closed):[0-9a-f-]{36}$/.test(beforeId)))) {
      return NextResponse.json({ error: "Invalid recent info cursor" }, { status: 400 });
    }
    try {
      return NextResponse.json(await fetchCareerRecentInfoPage({
        admin,
        talentId: user.id,
        before: beforeAt && beforeId !== null ? { at: beforeAt, id: beforeId } : undefined,
      }));
    } catch (error) {
      console.error("[CareerRecentInfo] Failed to load", error);
      return NextResponse.json({ error: "Failed to load recent info" }, { status: 500 });
    }
  }
  if (isProgressScope) {
    try {
      const priorityReviews = await readPriorityReviewProgress(admin,user.id);
      const opportunities = await fetchTalentOpportunityHistory({
        admin,
        historyTab: "saved",
        locale,
        sourceType: "internal",
        userId: user.id,
      });
      const connections = opportunities.flatMap((item) => {
        const connection = getCareerWaitingConnection(item);
        return connection ? [connection] : [];
      });
      return NextResponse.json({
        connections,
        priorityReviews,
        searchStatus: setting.status,
      } satisfies CareerTaskProgressSnapshot);
    } catch (error) {
      console.error("[CareerTaskProgress] Failed to load", error);
      return NextResponse.json(
        { error: "Failed to load career task progress" },
        { status: 500 }
      );
    }
  }
  if (isReengagementScope) {
    const snapshot = await fetchCareerReengagementPendingActions({
      admin,
      includeReevaluationQuestion: setting.profile_visibility !== "dont_share",
      locale,
      sourceLimit: 100,
      userId: user.id,
    });
    return NextResponse.json({
      actions: snapshot.actions,
      promptActions: snapshot.promptActions,
    } satisfies CareerReengagementPendingActionsSnapshot);
  }

  const unavailableCategories: string[] = [];
  const [
    callRequests,
    careerCheckInCall,
    fitQuestion,
    companyRequests,
    internalOpportunities,
    meetingSchedules,
  ] = await Promise.all([
    withPendingActionsFallback({
      unavailableCategories,
      fallback: [],
      label: "internal opportunity calls",
      promise: fetchPendingInternalOpportunityCallRequests({
        admin,
        userId: user.id,
      }),
      userId: user.id,
    }),
    withPendingActionsFallback({
      unavailableCategories,
      fallback: null,
      label: "career check-in call",
      promise: fetchOpenCareerCheckInCall({
        admin,
        userId: user.id,
      }),
      userId: user.id,
    }),
    withPendingActionsFallback({
      unavailableCategories,
      fallback: null,
      label: "internal fit question",
      promise:
        setting.profile_visibility === "dont_share"
          ? Promise.resolve(null)
          : fetchActiveInternalFitHoldQuestion({
              admin,
              locale,
              userId: user.id,
            }),
      userId: user.id,
    }),
    withPendingActionsFallback({
      unavailableCategories,
      fallback: [],
      label: "company requests",
      promise: fetchActiveCompanyTalentRequests({
        admin: admin as any,
        awaitingTalentOnly: true,
        requestOnly: true,
        talentId: user.id,
      }),
      userId: user.id,
    }),
    withPendingActionsFallback({
      unavailableCategories,
      fallback: [],
      label: "internal opportunities",
      promise: fetchTalentOpportunityHistory({
        admin,
        historyTab: "new",
        limit: 100,
        locale,
        sourceType: "internal",
        userId: user.id,
      }),
      userId: user.id,
    }),
    withPendingActionsFallback({
      unavailableCategories,
      fallback: [],
      label: "meeting schedules",
      promise: fetchPendingTalentMeetingSchedules({
        admin,
        limit: 100,
        talentId: user.id,
      }),
      userId: user.id,
    }),
  ]);

  const actions: CareerPendingAction[] = [
    ...callRequests.map((callRequest) => ({
      callRequest,
      id: callRequest.id,
      kind: "internal_opportunity_call" as const,
    })),
    ...(careerCheckInCall
      ? [
          {
            callRequest: careerCheckInCall,
            id: careerCheckInCall.id,
            kind: "career_check_in_call" as const,
          },
        ]
      : []),
    ...companyRequests.map((request) => {
      const companyName = cleanText(
        request.workspace?.company_name,
        careerT(
          locale,
          "career.api.pending_actions.fallback_company",
          "채용 회사"
        ),
        160
      );
      const roleTitle = cleanText(
        request.role?.name,
        careerT(
          locale,
          "career.api.pending_actions.fallback_role",
          "제안받은 포지션"
        ),
        180
      );
      return {
        companyLogoUrl: getCompanyTalentRequestLogoUrl(request),
        companyName,
        expiresAt: null,
        id: request.id,
        kind: "company_request" as const,
        prompt: request.expects_document
          ? careerT(
              locale,
              "career.api.pending_actions.resume_prompt",
              "{companyName}에서 {roleTitle} 검토를 위해 최신 이력서를 요청했어요. 업로드하거나, 최신본이 없거나 공유하지 않겠다고 답할 수 있어요.",
              { values: { companyName, roleTitle } }
            )
          : cleanText(
              request.request_context,
              careerT(
                locale,
                "career.api.pending_actions.question_prompt",
                "{companyName}에서 {roleTitle}와 관련해 확인을 요청했어요.",
                { values: { companyName, roleTitle } }
              )
            ),
        requestMode: request.expects_document
          ? ("resume" as const)
          : ("question" as const),
        resumeRequestToken: request.expects_document
          ? createCompanyTalentResumeUploadToken({
              requestId: request.id,
              talentId: user.id,
            })
          : null,
        roleId: request.role_id,
        roleTitle,
      };
    }),
    ...(fitQuestion
      ? [
          {
            id: fitQuestion.fitId,
            kind: "internal_fit_question" as const,
            prompt: fitQuestion.summary,
          },
        ]
      : []),
    ...internalOpportunities
      .filter(
        (opportunity) =>
          !opportunity.isExpired &&
          isInternalRoleCandidateDecisionAvailable(opportunity.status)
      )
      .map((opportunity) => ({
        companyLogoUrl: opportunity.companyLogoUrl,
        companyName: opportunity.companyName,
        id: opportunity.id,
        kind: "internal_opportunity" as const,
        isCompanyIntro:
          opportunity.opportunityType === OpportunityType.IntroRequest,
        recommendationSummary: opportunity.recommendationSummary,
        roleId: opportunity.roleId,
        roleTitle: opportunity.title,
      })),
  ];

  return NextResponse.json({
    actions,
    meetingSchedules,
    unavailableCategories,
  } satisfies CareerPendingActionsSnapshot);
}
