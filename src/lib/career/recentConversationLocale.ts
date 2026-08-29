import { parseCareerPromptLocale } from "@/lib/career/promptLocale";

type ConversationLocaleMessage = {
  content: string;
  role: string;
};

const ENGLISH_SWITCH_PATTERNS = [
  /\b(?:speak|talk|continue|conversation|chat|respond|reply|answer)\b[\s\S]{0,80}\b(?:in\s+)?english\b/i,
  /\benglish\b[\s\S]{0,50}\b(?:please|conversation|speak|talk|reply|respond)\b/i,
  /(?:영어|영문)(?:로|로\s*(?:말|대화|답변|진행|전환))/i,
];

const KOREAN_SWITCH_PATTERNS = [
  /\b(?:speak|talk|continue|conversation|chat|respond|reply|answer)\b[\s\S]{0,80}\b(?:in\s+)?korean\b/i,
  /\bkorean\b[\s\S]{0,50}\b(?:please|conversation|speak|talk|reply|respond)\b/i,
  /(?:한국어|한글)(?:로|로\s*(?:말|대화|답변|진행|전환))/i,
];

function detectExplicitLocaleSwitch(content: string) {
  if (ENGLISH_SWITCH_PATTERNS.some((pattern) => pattern.test(content))) {
    return "en" as const;
  }
  if (KOREAN_SWITCH_PATTERNS.some((pattern) => pattern.test(content))) {
    return "ko" as const;
  }
  return null;
}

export function resolveCareerRecentConversationLocale(args: {
  fallbackLocale?: string | null;
  messages: readonly ConversationLocaleMessage[];
}) {
  let locale = parseCareerPromptLocale(args.fallbackLocale);

  for (const message of args.messages) {
    if (message.role !== "user") continue;
    locale = detectExplicitLocaleSwitch(message.content) ?? locale;
  }

  return locale ?? args.fallbackLocale ?? null;
}
