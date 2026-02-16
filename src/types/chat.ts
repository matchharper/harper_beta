import { UiSegment } from "@/hooks/chat/useChatSession";

export type CriteriaCardBlock = {
  type: "criteria_card";
  thinking: string;
  criteria: string[];
  ready: boolean;
};

export type ToolStatusBlock = {
  type: "tool_status";
  id?: string;
  name?: string;
  state?: "running" | "done" | "error";
  message?: string;
};

export type ToolResultBlock = {
  type: "tool_result";
  name?: string;
  title?: string;
  url?: string;
  excerpt?: string;
  truncated?: boolean;
};

export type FileContextBlock = {
  type: "file_context";
  name: string;
  size?: number;
  mime?: string;
  excerpt?: string;
  truncated?: boolean;
};

export type SettingsCtaBlock = {
  type: "settings_cta";
  text: string;
  buttonLabel?: string;
  href?: string;
};

export type FileAttachmentPayload = {
  name: string;
  text: string;
  size?: number;
  mime?: string;
  excerpt?: string;
  truncated?: boolean;
};

export type ChatBlock =
  | CriteriaCardBlock
  | ToolStatusBlock
  | ToolResultBlock
  | FileContextBlock
  | SettingsCtaBlock;

export type ChatMessage = {
  id?: string | number;
  role: "user" | "assistant";
  rawContent?: string; // raw content for UI block replacement
  content?: string; // plain text part
  segments?: UiSegment[]; // rendered UI blocks
};
