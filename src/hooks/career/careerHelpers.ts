import type {
  CareerMessage,
  CareerStage,
  MessageRole,
} from "@/components/career/types";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_INTEREST_PROMPT,
  TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE,
  TALENT_MESSAGE_TYPE_ONBOARDING_STATUS,
} from "@/lib/talentOnboarding/onboarding";

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

const findLastMessageTypeIndex = (
  messages: CareerMessage[],
  messageType: string
) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].messageType === messageType) {
      return index;
    }
  }
  return -1;
};

const hasChatAfterIndex = (messages: CareerMessage[], index: number) =>
  messages
    .slice(index + 1)
    .some((message) => (message.messageType ?? "chat") === "chat");

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
  const hasDeferredFlow = messages.some((message) =>
    [
      TALENT_MESSAGE_TYPE_ONBOARDING_INTEREST_PROMPT,
      TALENT_MESSAGE_TYPE_ONBOARDING_STATUS,
      TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE,
    ].includes(message.messageType)
  );

  return (
    stage !== "profile" &&
    hasProfileSubmit &&
    !hasDeferredFlow &&
    !hasUserChat &&
    !hasAssistantQuestion
  );
};

export const shouldShowOnboardingInterestSelector = (
  messages: CareerMessage[]
) => {
  const promptIndex = findLastMessageTypeIndex(
    messages,
    TALENT_MESSAGE_TYPE_ONBOARDING_INTEREST_PROMPT
  );
  if (promptIndex < 0) return false;

  const hasStatusAfter = messages
    .slice(promptIndex + 1)
    .some(
      (message) => message.messageType === TALENT_MESSAGE_TYPE_ONBOARDING_STATUS
    );

  return !hasStatusAfter && !hasChatAfterIndex(messages, promptIndex);
};

export const shouldShowContinueConversationAction = (
  messages: CareerMessage[]
) => {
  const closeIndex = findLastMessageTypeIndex(
    messages,
    TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE
  );
  if (closeIndex < 0) return false;

  return !hasChatAfterIndex(messages, closeIndex);
};

export const isOnboardingPaused = (messages: CareerMessage[]) =>
  shouldShowOnboardingInterestSelector(messages) ||
  shouldShowContinueConversationAction(messages);
