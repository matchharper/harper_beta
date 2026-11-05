import { ChatThinkingLogPanel } from "@/components/chat/ChatThinkingLogPanel";
import type { CareerTurnEvent } from "@/lib/career/turnDisplay";
import CareerMessageBubble from "../CareerMessageBubble";
import { useCareerT } from "@/i18n/useCareerT";
import { memo } from "react";

type ThinkingLogPanelProps = {
  active?: boolean;
  completedAt?: string;
  logs: string[];
  events?: CareerTurnEvent[];
  startedAt?: string;
};

export const ThinkingLogPanel = memo(function ThinkingLogPanel({
  active = false,
  completedAt,
  logs,
  events,
  startedAt,
}: ThinkingLogPanelProps) {
  const t = useCareerT();
  const entries = events?.length
    ? events.map((event) => ({
        id: event.id,
        label: event.text,
        content: event.kind === "message" ? (
          <CareerMessageBubble
            isUser={false}
            message={{
              createdAt: startedAt ?? "",
              id: event.id,
              role: "assistant",
              content: event.text,
              messageType: "chat",
            }}
          />
        ) : undefined,
      }))
    : logs;
  return (
    <ChatThinkingLogPanel
      active={active}
      completedAt={completedAt}
      hasToolWork={entries.length > 0}
      liveLine
      statusLabel={
        active
          ? // Shown while no step is running: before the first step, or after
            // Harper has spoken and is deciding what to do next.
            entries.length === 0
            ? t("career.chat.live.thinking", "생각하는 중")
            : t("career.chat.live.next_step", "다음 할 일을 정하는 중")
          : entries.length === 0
            ? "Thought"
            : undefined
      }
      logs={entries}
      startedAt={startedAt}
    />
  );
});
