import { careerT } from "@/lib/career/translatedCareerMessage";
import { withIsMobile } from "@/lib/requestDevice";
import {
  appendInternalOpportunityCallRequestMarker,
  fetchPendingInternalOpportunityCallRequests,
  maybeCreateInternalOpportunityCallRequest,
  type InternalOpportunityCallRequest,
} from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import {
  fetchTalentSetting,
  toTalentMessageResponse,
  type TalentAdminClient,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import {
  fetchTalentOpportunityHistoryByIds,
  type TalentOpportunityFeedback,
  type TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";

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

async function fetchFeedbackOpportunity(args: {
  admin: TalentAdminClient;
  opportunityId?: string | null;
  userId: string;
}) {
  const opportunityId = String(args.opportunityId ?? "").trim();
  if (!opportunityId) return null;

  const [opportunity] = await fetchTalentOpportunityHistoryByIds({
    admin: args.admin,
    ids: [opportunityId],
    userId: args.userId,
  });

  return opportunity ?? null;
}

async function resolveInternalOpportunityCallRequest(args: {
  admin: TalentAdminClient;
  conversationId: string;
  feedback?: TalentOpportunityFeedback | null;
  opportunity: TalentOpportunityHistoryItem | null;
  userId: string;
}) {
  if (
    args.feedback !== "positive" ||
    args.opportunity?.sourceType !== "internal"
  ) {
    return null;
  }

  return maybeCreateInternalOpportunityCallRequest({
    admin: args.admin,
    conversationId: args.conversationId,
    opportunity: args.opportunity,
    userId: args.userId,
  });
}

function buildInternalCallRequestAssistantContent(args: {
  callRequest: InternalOpportunityCallRequest;
  locale?: string | null;
}) {
  const content = careerT(
    args.locale,
    "career.internal_opportunity.call_request_created",
    [
      "추가로, 혹시 저와 짧게 통화 가능하신가요?",
      "",
      "평가 목적의 통화는 아니고, {companyName} {roleTitle} 연결 건으로 회사에 더 정확히 소개드리기 위해 역할 관련 질문 몇 가지만 확인하려고 합니다.",
      "",
      "- 회사 쪽이 보통 궁금해하는 부분을 짧게 확인할 예정이에요",
      "- 답변해주시면 소개 자료를 더 구체적으로 만들 수 있어요",
      "- 통화하지 않으셔도 연결 프로세스는 그대로 진행됩니다",
      "",
      "편하실 때 아래에서 바로 진행해주세요.",
    ].join("\n"),
    {
      values: {
        companyName: args.callRequest.companyName,
        roleTitle: args.callRequest.roleTitle,
      },
    }
  );

  return appendInternalOpportunityCallRequestMarker({
    callRequest: args.callRequest,
    content,
  });
}

async function insertInternalCallRequestAssistantMessage(args: {
  admin: TalentAdminClient;
  callRequest: InternalOpportunityCallRequest;
  conversationId: string;
  isMobile?: boolean | null;
  locale?: string | null;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .insert(
      withIsMobile(
        {
          conversation_id: args.conversationId,
          user_id: args.userId,
          role: "assistant",
          content: buildInternalCallRequestAssistantContent({
            callRequest: args.callRequest,
            locale: args.locale,
          }),
          message_type: "chat",
        },
        args.isMobile
      )
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to insert call request message");
  }

  return toTalentMessageResponse(data as TalentMessageRow);
}

async function fetchPendingInternalCallRequestsSafely(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  try {
    return await fetchPendingInternalOpportunityCallRequests({
      admin: args.admin,
      userId: args.userId,
    });
  } catch (error) {
    console.error("[career-history:internal-call-request-pending]", {
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
    return undefined;
  }
}

export async function createInternalOpportunityCallRequestFollowUp(args: {
  admin: TalentAdminClient;
  conversationId: string | null;
  feedback?: TalentOpportunityFeedback | null;
  isMobile?: boolean | null;
  opportunityId?: string | null;
  userId: string;
}) {
  const conversationId = String(args.conversationId ?? "").trim();
  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  await assertConversationAccess({
    admin: args.admin,
    conversationId,
    userId: args.userId,
  });

  const opportunity = await fetchFeedbackOpportunity({
    admin: args.admin,
    opportunityId: args.opportunityId,
    userId: args.userId,
  });

  let callRequest: InternalOpportunityCallRequest | null = null;
  try {
    callRequest = await resolveInternalOpportunityCallRequest({
      admin: args.admin,
      conversationId,
      feedback: args.feedback,
      opportunity,
      userId: args.userId,
    });
  } catch (error) {
    console.error("[career-history:internal-call-request-follow-up]", {
      error: error instanceof Error ? error.message : String(error),
      opportunityId: opportunity?.id ?? args.opportunityId ?? null,
      userId: args.userId,
    });
  }

  const [talentSetting, pendingInternalOpportunityCallRequests] =
    await Promise.all([
      callRequest
        ? fetchTalentSetting({
            admin: args.admin,
            userId: args.userId,
          })
        : Promise.resolve(null),
      fetchPendingInternalCallRequestsSafely({
        admin: args.admin,
        userId: args.userId,
      }),
    ]);

  const assistantMessage = callRequest
    ? await insertInternalCallRequestAssistantMessage({
        admin: args.admin,
        callRequest,
        conversationId,
        isMobile: args.isMobile,
        locale: talentSetting?.preferred_locale ?? null,
        userId: args.userId,
      })
    : null;

  return {
    assistantMessage,
    pendingInternalOpportunityCallRequest: callRequest,
    pendingInternalOpportunityCallRequests,
  };
}
