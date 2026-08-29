import { NextRequest, NextResponse } from "next/server";
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
} from "@/lib/companyTalentRequests/server";
import { fetchTalentOpportunityHistory } from "@/lib/talentOpportunity";
import type {
  CareerPendingAction,
  CareerReengagementPendingActionsSnapshot,
} from "@/lib/career/pendingActions";
import { fetchCareerReengagementPendingActions } from "@/lib/career/reengagementPendingActions.server";
import { careerT } from "@/lib/career/translatedCareerMessage";

const cleanText = (value: unknown, fallback: string, maxLength = 1000) => {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, maxLength);
};

async function withPendingActionsFallback<T>(args: {
  fallback: T;
  label: string;
  promise: Promise<T>;
  userId: string;
}) {
  try {
    return await args.promise;
  } catch (error) {
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
  const setting = await fetchTalentSetting({ admin, userId: user.id });
  const isReengagementScope =
    req.nextUrl.searchParams.get("scope") === "reengagement";
  if (!setting?.is_onboarding_done) {
    if (isReengagementScope) {
      return NextResponse.json({
        actions: [],
        promptActions: [],
      } satisfies CareerReengagementPendingActionsSnapshot);
    }
    return NextResponse.json({ actions: [] satisfies CareerPendingAction[] });
  }

  const locale =
    req.nextUrl.searchParams.get("locale") ?? setting.preferred_locale;
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

  const [callRequests, fitQuestion, companyRequests, internalOpportunities] =
    await Promise.all([
      withPendingActionsFallback({
        fallback: [],
        label: "internal opportunity calls",
        promise: fetchPendingInternalOpportunityCallRequests({
          admin,
          userId: user.id,
        }),
        userId: user.id,
      }),
      withPendingActionsFallback({
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
        fallback: [],
        label: "company requests",
        promise: fetchActiveCompanyTalentRequests({
          admin: admin as any,
          awaitingTalentOnly: true,
          talentId: user.id,
        }),
        userId: user.id,
      }),
      withPendingActionsFallback({
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
    ]);

  const actions: CareerPendingAction[] = [
    ...callRequests.map((callRequest) => ({
      callRequest,
      id: callRequest.id,
      kind: "internal_opportunity_call" as const,
    })),
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
        companyName,
        expiresAt: request.expires_at,
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
    ...internalOpportunities.map((opportunity) => ({
      companyLogoUrl: opportunity.companyLogoUrl,
      companyName: opportunity.companyName,
      id: opportunity.id,
      kind: "internal_opportunity" as const,
      recommendationSummary: opportunity.recommendationSummary,
      roleId: opportunity.roleId,
      roleTitle: opportunity.title,
    })),
  ];

  return NextResponse.json({ actions });
}
