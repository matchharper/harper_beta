import { ChatThinkingLogPanel } from "@/components/chat/ChatThinkingLogPanel";
import { memo } from "react";

import { careerTimelineBodyTextClassName } from "../careerTimelineTypography";

type ThinkingLogPanelProps = {
  active?: boolean;
  completedAt?: string;
  logs: string[];
  startedAt?: string;
};

export const ThinkingLogPanel = memo(function ThinkingLogPanel({
  active = false,
  completedAt,
  logs,
  startedAt,
}: ThinkingLogPanelProps) {
  return (
    <ChatThinkingLogPanel
      active={active}
      completedAt={completedAt}
      hasToolWork
      logs={logs}
      startedAt={startedAt}
      typographyClassName={careerTimelineBodyTextClassName}
    />
  );
});
