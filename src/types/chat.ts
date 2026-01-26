import { UiSegment } from "@/hooks/chat/useChatSession";

export type CriteriaCardBlock = {
  type: "criteria_card";
  thinking: string;
  criteria: string[];
  ready: boolean;
};

export type ChatBlock = CriteriaCardBlock;

export type ChatMessage = {
  id?: string | number;
  role: "user" | "assistant";
  rawContent?: string; // raw content for UI block replacement
  content?: string; // plain text part
  segments?: UiSegment[]; // rendered UI blocks
};
