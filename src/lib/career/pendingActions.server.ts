import "server-only";

import {
  createCompanyTalentResumeUploadToken,
  fetchActiveCompanyTalentRequest,
} from "@/lib/companyTalentRequests/server";
import type {
  CareerPendingAction,
  CareerPendingActionOpenTarget,
  CareerPendingActionReference,
  CareerOpenablePendingActionReference,
} from "@/lib/career/pendingActions";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { resolveTalentPendingMeetingPath } from "@/lib/meetings/talentPendingMeeting.server";
import { fetchTalentOpportunityHistoryByIds } from "@/lib/talentOpportunity";
import { fetchActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

const cleanText = (value: unknown, fallback: string, maxLength = 1000) => {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, maxLength);
};

export async function resolveCareerPendingAction(args: {
  admin: TalentAdminClient;
  locale?: string | null;
  profileVisibility?: string | null;
  reference: CareerPendingActionReference;
  talentId: string;
}): Promise<Exclude<
  CareerPendingAction,
  { kind: "internal_opportunity_call" }
> | null> {
  if (args.reference.kind === "company_request") {
    const request = await fetchActiveCompanyTalentRequest({
      admin: args.admin as any,
      awaitingTalentOnly: true,
      requestId: args.reference.id,
      talentId: args.talentId,
    });
    if (!request) return null;

    const companyName = cleanText(
      request.workspace?.company_name,
      careerT(
        args.locale,
        "career.api.pending_actions.fallback_company",
        "채용 회사"
      ),
      160
    );
    const roleTitle = cleanText(
      request.role?.name,
      careerT(
        args.locale,
        "career.api.pending_actions.fallback_role",
        "제안받은 포지션"
      ),
      180
    );
    return {
      companyName,
      expiresAt: request.expires_at,
      id: request.id,
      kind: "company_request",
      prompt: request.expects_document
        ? careerT(
            args.locale,
            "career.api.pending_actions.resume_prompt",
            "{companyName}에서 {roleTitle} 검토를 위해 최신 이력서를 요청했어요. 업로드하거나, 최신본이 없거나 공유하지 않겠다고 답할 수 있어요.",
            { values: { companyName, roleTitle } }
          )
        : cleanText(
            request.request_context,
            careerT(
              args.locale,
              "career.api.pending_actions.question_prompt",
              "{companyName}에서 {roleTitle}와 관련해 확인을 요청했어요.",
              { values: { companyName, roleTitle } }
            )
          ),
      requestMode: request.expects_document ? "resume" : "question",
      resumeRequestToken: request.expects_document
        ? createCompanyTalentResumeUploadToken({
            requestId: request.id,
            talentId: args.talentId,
          })
        : null,
      roleId: request.role_id,
      roleTitle,
    };
  }

  if (args.reference.kind === "internal_fit_question") {
    if (args.profileVisibility === "dont_share") return null;
    const question = await fetchActiveInternalFitHoldQuestion({
      admin: args.admin,
      locale: args.locale,
      userId: args.talentId,
    });
    if (!question || question.fitId !== args.reference.id) return null;
    return {
      id: question.fitId,
      kind: "internal_fit_question",
      prompt: question.summary,
    };
  }

  const [opportunity] = await fetchTalentOpportunityHistoryByIds({
    admin: args.admin,
    ids: [args.reference.id],
    locale: args.locale,
    userId: args.talentId,
  });
  if (
    !opportunity ||
    opportunity.sourceType !== "internal" ||
    opportunity.feedback !== null ||
    opportunity.savedStage === "hidden" ||
    opportunity.isExpired ||
    opportunity.status.trim().toLowerCase() !== "active"
  ) {
    return null;
  }
  return {
    companyLogoUrl: opportunity.companyLogoUrl,
    companyName: opportunity.companyName,
    id: opportunity.id,
    kind: "internal_opportunity",
    recommendationSummary: opportunity.recommendationSummary,
    roleId: opportunity.roleId,
    roleTitle: opportunity.title,
  };
}

export async function resolveCareerPendingActionOpenTarget(args: {
  admin: TalentAdminClient;
  locale?: string | null;
  profileVisibility?: string | null;
  reference: CareerOpenablePendingActionReference;
  talentId: string;
}): Promise<CareerPendingActionOpenTarget | null> {
  if (args.reference.kind === "meeting_schedule") {
    const path = await resolveTalentPendingMeetingPath({
      admin: args.admin,
      scheduleId: args.reference.id,
      talentId: args.talentId,
    });
    return path ? { path, type: "open_path" } : null;
  }

  const action = await resolveCareerPendingAction({
    admin: args.admin,
    locale: args.locale,
    profileVisibility: args.profileVisibility,
    reference: args.reference,
    talentId: args.talentId,
  });
  return action ? { action, type: "composer_pending_action" } : null;
}
