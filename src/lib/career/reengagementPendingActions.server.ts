import "server-only";

import { fetchActiveCompanyTalentRequests } from "@/lib/companyTalentRequests/server";
import {
  selectCareerReengagementPromptActions,
  type CareerReengagementPendingAction,
  type CareerReengagementPendingActionsSnapshot,
} from "@/lib/career/pendingActions";
import { fetchTalentOpportunityHistory } from "@/lib/talentOpportunity";
import { fetchActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import { fetchPendingInternalOpportunityCallRequests } from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

type ReengagementPendingActionCandidate = {
  action: CareerReengagementPendingAction;
  roleId: string | null;
};

const cleanText = (value: unknown, fallback = "", maxLength = 1000) => {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, maxLength);
};

async function withPendingActionFallback<T>(args: {
  fallback: T;
  label: string;
  promise: Promise<T>;
  userId: string;
}) {
  try {
    return await args.promise;
  } catch (error) {
    console.error(
      "[CareerReengagementPendingActions] Failed to load category",
      {
        error: error instanceof Error ? error.message : String(error),
        label: args.label,
        userId: args.userId,
      }
    );
    return args.fallback;
  }
}

function dedupeCandidatesByRole(
  candidates: ReengagementPendingActionCandidate[]
) {
  const seenRoleIds = new Set<string>();
  return candidates.flatMap((candidate) => {
    if (!candidate.roleId) return [candidate.action];
    if (seenRoleIds.has(candidate.roleId)) return [];
    seenRoleIds.add(candidate.roleId);
    return [candidate.action];
  });
}

export async function fetchCareerReengagementPendingActions(args: {
  admin: TalentAdminClient;
  includeReevaluationQuestion: boolean;
  locale?: string | null;
  sourceLimit?: number;
  userId: string;
}): Promise<CareerReengagementPendingActionsSnapshot> {
  const sourceLimit = Math.max(
    1,
    Math.min(Math.floor(args.sourceLimit ?? 10), 100)
  );
  const [companyRequests, callRequests, internalOpportunities, fitQuestion] =
    await Promise.all([
      withPendingActionFallback({
        fallback: [],
        label: "company requests",
        promise: fetchActiveCompanyTalentRequests({
          admin: args.admin as any,
          awaitingTalentOnly: true,
          limit: sourceLimit,
          talentId: args.userId,
        }),
        userId: args.userId,
      }),
      withPendingActionFallback({
        fallback: [],
        label: "talent calls",
        promise: fetchPendingInternalOpportunityCallRequests({
          admin: args.admin,
          userId: args.userId,
        }),
        userId: args.userId,
      }),
      withPendingActionFallback({
        fallback: [],
        label: "internal opportunities",
        promise: fetchTalentOpportunityHistory({
          admin: args.admin,
          historyTab: "new",
          limit: sourceLimit,
          locale: args.locale,
          sourceType: "internal",
          userId: args.userId,
        }),
        userId: args.userId,
      }),
      withPendingActionFallback({
        fallback: null,
        label: "reevaluation question",
        promise: args.includeReevaluationQuestion
          ? fetchActiveInternalFitHoldQuestion({
              admin: args.admin,
              locale: args.locale,
              userId: args.userId,
            })
          : Promise.resolve(null),
        userId: args.userId,
      }),
    ]);

  const candidates: ReengagementPendingActionCandidate[] = [
    ...companyRequests.map((request) => ({
      action: {
        companyName: cleanText(
          request.workspace?.company_name,
          "채용 회사",
          160
        ),
        kind: "company_request" as const,
        request: request.expects_document
          ? "최신 이력서 공유 요청"
          : cleanText(request.request_context, "추가 확인 요청"),
        roleTitle: cleanText(request.role?.name, "제안받은 포지션", 180),
      },
      roleId: cleanText(request.role_id, "", 160) || null,
    })),
    ...callRequests.map((callRequest) => ({
      action: {
        callId: callRequest.id,
        companyName: cleanText(callRequest.companyName, "채용 회사", 160),
        kind: "talent_call" as const,
        reason: cleanText(callRequest.reason, "", 500) || null,
        resumePromptNeeded: callRequest.resumePromptNeeded,
        roleTitle: cleanText(callRequest.roleTitle, "제안받은 포지션", 180),
      },
      roleId: cleanText(callRequest.roleId, "", 160) || null,
    })),
    ...internalOpportunities
      .filter(
        (opportunity) =>
          !opportunity.isExpired &&
          opportunity.status.trim().toLowerCase() === "active"
      )
      .map((opportunity) => ({
        action: {
          companyName: cleanText(opportunity.companyName, "채용 회사", 160),
          kind: "internal_opportunity" as const,
          recommendationSummary:
            cleanText(opportunity.recommendationSummary, "", 600) || null,
          roleTitle: cleanText(opportunity.title, "제안받은 포지션", 180),
        },
        roleId: cleanText(opportunity.roleId, "", 160) || null,
      })),
    ...(fitQuestion
      ? [
          {
            action: {
              kind: "reevaluation_question" as const,
              question: cleanText(fitQuestion.summary, "", 1000),
            },
            roleId: null,
          },
        ]
      : []),
  ];

  const actions = dedupeCandidatesByRole(
    candidates.filter((candidate) => {
      if (candidate.action.kind !== "reevaluation_question") return true;
      return Boolean(candidate.action.question);
    })
  );

  return {
    actions,
    promptActions: selectCareerReengagementPromptActions(actions),
  };
}
