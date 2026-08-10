import { ChatThinkingLogPanel } from "@/components/chat/ChatThinkingLogPanel";
import { memo } from "react";

import { careerTimelineBodyTextClassName } from "../careerTimelineTypography";

type ThinkingLogPanelProps = {
  active?: boolean;
  logs: string[];
};

export const ThinkingLogPanel = memo(function ThinkingLogPanel({
  active = false,
  logs,
}: ThinkingLogPanelProps) {
  return (
    <ChatThinkingLogPanel
      active={active}
      logs={logs}
      typographyClassName={careerTimelineBodyTextClassName}
    />
  );
});
