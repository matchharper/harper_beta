import React, { useRef, useState } from "react";
import { ArrowRight, Zap } from "lucide-react";
import { MuteButton, type MuteButtonProps } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerChatPanelContext } from "../CareerChatPanelContext";
import type { CareerHistoryOpportunity } from "../types";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";

export default function ApplyWithHarperButton({
  item,
  onOpenChat,
  pending = false,
  className = "mt-8",
  size,
  children = "Apply with Harper",
  onBeforeStart,
}: {
  item: CareerHistoryOpportunity;
  onOpenChat?: () => void;
  pending?: boolean;
  className?: string;
  size?: MuteButtonProps["size"];
  children?: React.ReactNode;
  onBeforeStart?: () => boolean | void | Promise<boolean | void>;
}) {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const chat = useCareerChatPanelContext();
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const disabled =
    pending ||
    sending ||
    !chat.user ||
    !chat.conversationId ||
    !chat.isOnboardingDone ||
    chat.stage === "profile" ||
    chat.sessionPending ||
    chat.profilePending ||
    chat.chatPending ||
    chat.assistantTyping ||
    chat.opportunityFeedbackFollowUpPending;

  const start = async () => {
    if (disabled || sendingRef.current) return;
    logCareerEvent("click_apply_with_harper", {
      roleId: item.roleId,
      opportunityId: item.id,
      source: onBeforeStart ? "application_modal" : "role_detail",
    });
    sendingRef.current = true;
    setSending(true);
    try {
      if (onBeforeStart && (await onBeforeStart()) !== true) return;
      const sent = chat.onSendChatMessage({
        text: t(
          "career.history.apply_with_harper.request",
          "이 포지션에 하퍼와 함께 지원하고 싶어. 지원 준비를 시작해줘."
        ),
        opportunityMentions: [
          {
            label: `${item.companyName} · ${item.title}`,
            roleId: item.roleId,
          },
        ],
      });
      // Show the chat as soon as the request starts, while the reply streams.
      onOpenChat?.();
      await sent;
    } catch {
      // The shared chat handler displays the request error and allows a retry.
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <MuteButton
      className={className}
      size={size}
      variant="primary"
      disabled={disabled}
      aria-busy={sending}
      onClick={() => void start()}
    >
      {children}
      <Zap className="h-4 w-4" aria-hidden="true" />
    </MuteButton>
  );
}
