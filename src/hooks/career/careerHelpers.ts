import type {
  CareerMessage,
  CareerStage,
  MessageRole,
} from "@/components/career/types";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
  TALENT_MESSAGE_TYPE_ONBOARDING_INTEREST_PROMPT,
  TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE,
  TALENT_MESSAGE_TYPE_ONBOARDING_STATUS,
} from "@/lib/talentOnboarding/onboarding";
import { stripPostgresUnsafeChars } from "@/lib/textSanitization";

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const normalizeText = (raw: string) =>
  stripPostgresUnsafeChars(raw)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const isDocxResumeFile = (file: File) =>
  file.type === DOCX_MIME_TYPE || file.name.toLowerCase().endsWith(".docx");

export async function readDocxResumeText(file: File) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ arrayBuffer });
    return normalizeText(String(parsed.value ?? ""));
  } catch (error) {
    console.warn("[CareerResume] docx parse failed", error);
    throw new Error(
      "DOCX 파일을 읽는데 실패했습니다. PDF나 텍스트 파일로 변환해서 올려주세요."
    );
  }
}

const normalizeThinkingLogs = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter(Boolean)
    : [];

export const toUiMessage = (message: {
  id: string | number;
  role: MessageRole;
  content: string;
  messageType?: string;
  createdAt?: string;
  opportunityPreview?: CareerMessage["opportunityPreview"];
  recommendationSearchRelation?: CareerMessage["recommendationSearchRelation"];
  recommendationSearchRun?: CareerMessage["recommendationSearchRun"];
  recommendationStatusAfterCharCount?: number | null;
  thinkingLogs?: unknown;
}): CareerMessage => ({
  id: message.id,
  role: message.role,
  content: message.content,
  messageType: message.messageType ?? "chat",
  createdAt: message.createdAt ?? new Date().toISOString(),
  opportunityPreview: message.opportunityPreview,
  recommendationSearchRelation: message.recommendationSearchRelation ?? null,
  recommendationSearchRun: message.recommendationSearchRun ?? null,
  recommendationStatusAfterCharCount:
    typeof message.recommendationStatusAfterCharCount === "number" &&
    Number.isFinite(message.recommendationStatusAfterCharCount) &&
    message.recommendationStatusAfterCharCount >= 0
      ? Math.floor(message.recommendationStatusAfterCharCount)
      : undefined,
  thinkingLogs: normalizeThinkingLogs(message.thinkingLogs),
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

export const PROFILE_LINK_SLOT_COUNT = 5;

const normalizeLinkForParsing = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const getLinkHost = (value: string) => {
  const normalized = normalizeLinkForParsing(value);
  if (!normalized) return "";

  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const isLinkedinLink = (value: string) => {
  const normalized = normalizeLinkForParsing(value);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
};

export const isLinkedinProfileLink = (value: string) => {
  const normalized = normalizeLinkForParsing(value);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    if (!isLinkedinLink(normalized)) return false;
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[0]?.toLowerCase() === "in" && Boolean(segments[1]?.trim());
  } catch {
    return false;
  }
};

export const getProfileLinkSlot = (value: string) => {
  const host = getLinkHost(value);
  if (!host) return null;

  if (isLinkedinProfileLink(value)) return 0;
  if (
    host === "github.com" ||
    host.endsWith(".github.com") ||
    host === "huggingface.co" ||
    host.endsWith(".huggingface.co")
  ) {
    return 1;
  }
  if (host.includes("scholar.google.")) return 2;
  if (
    host === "x.com" ||
    host.endsWith(".x.com") ||
    host === "twitter.com" ||
    host.endsWith(".twitter.com")
  ) {
    return 4;
  }

  return 3;
};

export const toProfileLinks = (links: string[] = []) => {
  const slottedLinks = Array.from(
    { length: PROFILE_LINK_SLOT_COUNT },
    () => ""
  );
  const extraLinks: string[] = [];
  const seenLinks = new Set<string>();

  for (const rawLink of links) {
    const link = String(rawLink ?? "").trim();
    if (!link) continue;
    const linkKey = link.toLowerCase();
    if (seenLinks.has(linkKey)) continue;
    seenLinks.add(linkKey);

    const slot = getProfileLinkSlot(link);
    if (slot === null || slottedLinks[slot]) {
      extraLinks.push(link);
      continue;
    }

    slottedLinks[slot] = link;
  }

  return [...slottedLinks, ...extraLinks];
};

export const compactProfileLinks = (links: string[] = []) =>
  toProfileLinks(links)
    .map((link) => link.trim())
    .filter(Boolean);

export const pickLinkedinProfileLink = (links: string[] = []) =>
  toProfileLinks(links)[0]?.trim() ?? "";

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

const CAREER_CONVERSATION_CONTINUATION_MESSAGE_TYPES = new Set([
  "chat",
  "call_transcript",
  "call_wrapup",
]);

const hasConversationContinuationAfterIndex = (
  messages: CareerMessage[],
  index: number
) =>
  messages
    .slice(index + 1)
    .some((message) =>
      CAREER_CONVERSATION_CONTINUATION_MESSAGE_TYPES.has(
        message.messageType ?? "chat"
      )
    );

const CAREER_CONVERSATION_ACTIVITY_MESSAGE_TYPES = new Set([
  "chat",
  "call_transcript",
  "call_wrapup",
  "mail",
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
  TALENT_MESSAGE_TYPE_ONBOARDING_INTEREST_PROMPT,
  TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE,
  TALENT_MESSAGE_TYPE_ONBOARDING_STATUS,
]);

export const shouldShowVoiceStartPrompt = (
  stage: CareerStage,
  messages: CareerMessage[]
) => {
  const hasProfileSubmit = messages.some(
    (message) => message.messageType === "profile_submit"
  );
  const hasConversationActivity = messages.some((message) =>
    CAREER_CONVERSATION_ACTIVITY_MESSAGE_TYPES.has(
      message.messageType ?? "chat"
    )
  );

  return (
    stage !== "profile" &&
    stage !== "completed" &&
    hasProfileSubmit &&
    !hasConversationActivity
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

  return (
    !hasStatusAfter &&
    !hasConversationContinuationAfterIndex(messages, promptIndex)
  );
};

export const shouldShowContinueConversationAction = (
  messages: CareerMessage[]
) => {
  const closeIndex = findLastMessageTypeIndex(
    messages,
    TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE
  );
  if (closeIndex < 0) return false;

  return !hasConversationContinuationAfterIndex(messages, closeIndex);
};

export const isOnboardingPaused = (messages: CareerMessage[]) =>
  shouldShowOnboardingInterestSelector(messages) ||
  shouldShowContinueConversationAction(messages);
