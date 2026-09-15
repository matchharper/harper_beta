import { careerT } from "@/lib/career/translatedCareerMessage";
import type { CareerRealtimeRecentMessage } from "@/lib/career/prompts/types";
import { formatCareerPromptMessageTimeLabel } from "@/lib/career/prompts/promptUtils";

export function buildCareerRealtimeRecentConversationSection(
  messages: CareerRealtimeRecentMessage[],
  preferredLocale?: string | null,
  timeZone?: string | null,
  now = new Date()
) {
  const recentMessages = messages.filter((message) => message.content.trim());
  if (recentMessages.length === 0) return "";

  const maxTotal = 2200;
  const maxPerMessage = 400;

  let section = "";
  section += careerT(
    preferredLocale,
    "career.call.opening.recent_context.header",
    "## 최근 채팅 맥락\n"
  );
  let totalLength = section.length;

  for (const message of recentMessages) {
    const baseRoleLabel =
      message.role === "assistant"
        ? "Harper"
        : careerT(
            preferredLocale,
            "career.call.opening.recent_context.user",
            "사용자"
          );
    const timeLabel = formatCareerPromptMessageTimeLabel(message.createdAt, {
      now,
      preferredLocale,
      timeZone,
    });
    const roleLabel = timeLabel
      ? `[${timeLabel}] ${baseRoleLabel}`
      : baseRoleLabel;
    const normalizedContent = message.content.replace(/\s+/g, " ").trim();
    const truncatedContent =
      normalizedContent.length > maxPerMessage
        ? `${normalizedContent.slice(0, maxPerMessage)}...`
        : normalizedContent;
    const line = `- ${roleLabel}: ${truncatedContent}\n`;

    if (totalLength + line.length > maxTotal) break;
    section += line;
    totalLength += line.length;
  }
  return section;
}
