import { careerT } from "@/lib/career/translatedCareerMessage";
import type { CareerRealtimeRecentMessage } from "@/lib/career/prompts/types";

function formatCareerRealtimeRelativeTime(
  createdAt: string | null | undefined,
  nowMs: number,
  preferredLocale?: string | null
) {
  const createdAtMs = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(createdAtMs)) return "";

  const elapsedMs = nowMs - createdAtMs;
  if (elapsedMs < 0) return "";

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30 * dayMs;

  if (elapsedMs < minuteMs) {
    return careerT(
      preferredLocale,
      "career.call.opening.relative.just_now",
      "방금전"
    );
  }
  if (elapsedMs < hourMs) {
    const minutes = Math.floor(elapsedMs / minuteMs);
    if (minutes === 1) {
      return careerT(
        preferredLocale,
        "career.call.opening.relative.minute_one",
        "{count}분전",
        { values: { count: minutes } }
      );
    }
    return careerT(
      preferredLocale,
      "career.call.opening.relative.minute_many",
      "{count}분전",
      { values: { count: minutes } }
    );
  }
  if (elapsedMs < dayMs) {
    const hours = Math.floor(elapsedMs / hourMs);
    if (hours === 1) {
      return careerT(
        preferredLocale,
        "career.call.opening.relative.hour_one",
        "{count}시간전",
        { values: { count: hours } }
      );
    }
    return careerT(
      preferredLocale,
      "career.call.opening.relative.hour_many",
      "{count}시간전",
      { values: { count: hours } }
    );
  }
  if (elapsedMs < monthMs) {
    const days = Math.floor(elapsedMs / dayMs);
    if (days === 1) {
      return careerT(
        preferredLocale,
        "career.call.opening.relative.day_one",
        "{count}일전",
        { values: { count: days } }
      );
    }
    return careerT(
      preferredLocale,
      "career.call.opening.relative.day_many",
      "{count}일전",
      { values: { count: days } }
    );
  }
  const months = Math.floor(elapsedMs / monthMs);
  if (months === 1) {
    return careerT(
      preferredLocale,
      "career.call.opening.relative.month_one",
      "{count}개월전",
      { values: { count: months } }
    );
  }
  return careerT(
    preferredLocale,
    "career.call.opening.relative.month_many",
    "{count}개월전",
    { values: { count: months } }
  );
}

export function buildCareerRealtimeRecentConversationSection(
  messages: CareerRealtimeRecentMessage[],
  preferredLocale?: string | null
) {
  const recentMessages = messages.filter((message) => message.content.trim());
  if (recentMessages.length === 0) return "";

  const maxTotal = 2200;
  const maxPerMessage = 400;

  let section = "";
  section += careerT(
    preferredLocale,
    "career.call.opening.recent_context.header",
    "## 최근 대화\n"
  );
  let totalLength = section.length;
  const nowMs = Date.now();

  for (const message of recentMessages) {
    const baseRoleLabel =
      message.role === "assistant"
        ? "Harper"
        : careerT(
            preferredLocale,
            "career.call.opening.recent_context.user",
            "사용자"
          );
    const relativeTime = formatCareerRealtimeRelativeTime(
      message.createdAt,
      nowMs,
      preferredLocale
    );
    const roleLabel = relativeTime
      ? `${baseRoleLabel}(${relativeTime})`
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
