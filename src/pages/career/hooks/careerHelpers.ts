import type {
  CareerMessage,
  CareerStage,
  MessageRole,
} from "@/components/career/types";

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const normalizeText = (raw: string) =>
  raw
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const toUiMessage = (message: {
  id: string | number;
  role: MessageRole;
  content: string;
  messageType?: string;
  createdAt?: string;
}): CareerMessage => ({
  id: message.id,
  role: message.role,
  content: message.content,
  messageType: message.messageType ?? "chat",
  createdAt: message.createdAt ?? new Date().toISOString(),
});

export const getErrorMessage = (payload: unknown, fallback: string) => {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (
    typeof payload === "object" &&
    payload &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
};

export const toProfileLinks = (links: string[] = []) => [
  links[0] ?? "",
  links[1] ?? "",
  links[2] ?? "",
  ...links.slice(3),
];

export const shouldShowVoiceStartPrompt = (
  stage: CareerStage,
  messages: CareerMessage[]
) => {
  const hasProfileSubmit = messages.some(
    (message) => message.messageType === "profile_submit"
  );
  const hasUserChat = messages.some(
    (message) =>
      message.role === "user" && (message.messageType ?? "chat") === "chat"
  );
  const hasAssistantQuestion = messages.some(
    (message) =>
      message.role === "assistant" &&
      (message.messageType ?? "chat") === "chat"
  );

  return stage !== "profile" && hasProfileSubmit && !hasUserChat && !hasAssistantQuestion;
};
