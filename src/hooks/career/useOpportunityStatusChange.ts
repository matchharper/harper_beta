import { useRef } from "react";
import { useOptionalCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import type {
  CareerHistoryOpportunity,
  CareerOpportunitySavedStage,
} from "@/components/career/types";
import {
  canChangeCareerOpportunityManagementStatus,
  getCareerOpportunityManagementStatus,
  type CareerOpportunityManagementStatus,
} from "@/components/career/history/savedOpportunityStatus";
import { useCareerT } from "@/i18n/useCareerT";

export function useOpportunityStatusChange({
  update,
  navigate,
  openChat,
}: {
  update: (
    id: string,
    status: CareerOpportunitySavedStage,
    item?: CareerHistoryOpportunity
  ) => boolean | void | Promise<boolean | void>;
  navigate: (
    status: CareerOpportunitySavedStage,
    item: CareerHistoryOpportunity
  ) => void;
  openChat: () => void;
}) {
  const chat = useOptionalCareerChatPanelContext();
  const t = useCareerT();
  const pending = useRef(new Set<string>());
  return async (
    item: CareerHistoryOpportunity,
    status: CareerOpportunityManagementStatus
  ) => {
    if (
      status === "archived" ||
      pending.current.has(item.id) ||
      !canChangeCareerOpportunityManagementStatus(item) ||
      getCareerOpportunityManagementStatus(item) === status
    )
      return;
    if (
      status === "offer" &&
      (!chat?.user ||
        !chat.conversationId ||
        chat.chatPending ||
        chat.assistantTyping ||
        chat.sessionPending ||
        chat.profilePending ||
        chat.opportunityFeedbackFollowUpPending)
    )
      return;
    pending.current.add(item.id);
    try {
      if ((await update(item.id, status, item)) !== true) return;
      navigate(status, item);
      if (status === "offer" && chat) {
        const opportunity = {
          roleId: item.roleId,
          label: `${item.companyName} · ${item.title}`,
        };
        const text = t(
          "career.history.progress.offer_message",
          "{opportunity}에 최종합격했어요.",
          { values: { opportunity: opportunity.label } }
        );
        const sending = chat.onSendChatMessage({
          text,
          opportunityMentions: [opportunity],
          onError: () =>
            chat.onPrepareChatDraft?.({
              opportunityMention: opportunity,
              text,
            }),
        });
        openChat();
        await sending;
      }
    } finally {
      pending.current.delete(item.id);
    }
  };
}
