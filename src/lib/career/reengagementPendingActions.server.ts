import "server-only";

import { fetchActiveCompanyTalentRequests } from "@/lib/companyTalentRequests/server";
import {
  selectCareerReengagementPromptActions,
  type CareerOpenablePendingActionReference,
  type CareerReengagementPendingAction,
  type CareerReengagementPendingActionsSnapshot,
} from "@/lib/career/pendingActions";
import { fetchPendingTalentMeetingSchedules } from "@/lib/meetings/talentPendingMeeting.server";
import { fetchTalentOpportunityHistory } from "@/lib/talentOpportunity";
import { fetchActiveInternalFitHoldQuestion } from "@/lib/talentOnboarding/internalFitHoldQuestion";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

type WithoutActionKey<T> = T extends unknown ? Omit<T, "actionKey"> : never;

type ReengagementPendingActionCandidate = {
  action: WithoutActionKey<CareerReengagementPendingAction>;
  reference: CareerOpenablePendingActionReference;
  roleId: string | null;
};

export type CareerReengagementPendingActionsServerSnapshot =
  CareerReengagementPendingActionsSnapshot & {
    actionReferences: Record<string, CareerOpenablePendingActionReference>;
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
    if (!candidate.roleId) return [candidate];
    if (seenRoleIds.has(candidate.roleId)) return [];
    seenRoleIds.add(candidate.roleId);
    return [candidate];
  });
}

export async function fetchCareerReengagementPendingActions(args: {
  admin: TalentAdminClient;
  includeReevaluationQuestion: boolean;
  locale?: string | null;
  sourceLimit?: number;
  userId: string;
}): Promise<CareerReengagementPendingActionsServerSnapshot> {
  const sourceLimit = Math.max(
    1,
    Math.min(Math.floor(args.sourceLimit ?? 10), 100)
  );
  const [
    meetingSchedules,
    companyRequests,
    internalOpportunities,
    fitQuestion,
  ] = await Promise.all([
    withPendingActionFallback({
      fallback: [],
      label: "meeting schedules",
      promise: fetchPendingTalentMeetingSchedules({
        admin: args.admin,
        limit: sourceLimit,
        talentId: args.userId,
      }),
      userId: args.userId,
    }),
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
    ...meetingSchedules.map((schedule) => ({
      action: {
        companyName: cleanText(schedule.companyName, "채용 회사", 160),
        kind: "meeting_schedule" as const,
        roleTitle: cleanText(schedule.roleTitle, "미팅 요청", 180),
      },
      reference: {
        id: schedule.scheduleId,
        kind: "meeting_schedule" as const,
      },
      roleId: cleanText(schedule.roleId, "", 160) || null,
    })),
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
      reference: { id: request.id, kind: "company_request" as const },
      roleId: cleanText(request.role_id, "", 160) || null,
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
        reference: {
          id: cleanText(opportunity.id, "", 160),
          kind: "internal_opportunity" as const,
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
            reference: {
              id: cleanText(fitQuestion.fitId, "", 160),
              kind: "internal_fit_question" as const,
            },
            roleId: null,
          },
        ]
      : []),
  ];

  const dedupedCandidates = dedupeCandidatesByRole(
    candidates.filter((candidate) => {
      if (candidate.action.kind !== "reevaluation_question") return true;
      return Boolean(candidate.action.question);
    })
  );
  const actionReferences: Record<string, CareerOpenablePendingActionReference> =
    {};
  const actions = dedupedCandidates.map((candidate, index) => {
    const actionKey = `pending_${index + 1}`;
    actionReferences[actionKey] = candidate.reference;
    return {
      ...candidate.action,
      actionKey,
    } as CareerReengagementPendingAction;
  });

  return {
    actionReferences,
    actions,
    promptActions: selectCareerReengagementPromptActions(actions),
  };
}
