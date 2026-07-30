import { careerT } from "@/lib/career/translatedCareerMessage";

type OpportunityDiscoveryAdmin = {
  from: (table: string) => any;
};

export const INITIAL_RECOMMENDATION_PENDING_REASON =
  "initial_conversation_recommendation_pending";

export type ActiveInitialConversationRun = {
  created_at: string;
  id: string;
  status: "queued" | "running";
};

export async function fetchActiveInitialConversationRun(args: {
  admin: OpportunityDiscoveryAdmin;
  userId: string;
}): Promise<ActiveInitialConversationRun | null> {
  const { data, error } = await args.admin
    .from("opportunity_discovery_run")
    .select("id, created_at, status")
    .eq("talent_id", args.userId)
    .eq("trigger", "conversation_completed")
    .eq("run_mode", "initial")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message ?? "Failed to check the initial opportunity discovery run"
    );
  }

  return (data ?? null) as ActiveInitialConversationRun | null;
}

export function getInitialRecommendationPendingAnswer(locale?: string | null) {
  return careerT(
    locale,
    "career.job_posting_recommendations.answer.initial_pending",
    "첫 번째 추천은 저희가 이메일로 보내드릴 예정이에요. 잠시만 기다려 주세요. 혹시 1시간이 지나도 도착하지 않는다면 알려주세요. 그 이후부터는 좋은 기회를 주기적으로 찾아 먼저 이메일로 알려드릴 예정이고, 저에게 지금처럼 말씀해주시면 바로 찾아드릴게요."
  );
}

export function buildInitialRecommendationPendingResult(args: {
  locale?: string | null;
}) {
  return {
    answerDraft: getInitialRecommendationPendingAnswer(args.locale),
    candidateCount: 0,
    initialRecommendationPending: true,
    postingRoleIds: [] as string[],
    recommendationCount: 0,
    searchPlan: {
      deferredReason: INITIAL_RECOMMENDATION_PENDING_REASON,
      sourceType: "external",
    },
  };
}
