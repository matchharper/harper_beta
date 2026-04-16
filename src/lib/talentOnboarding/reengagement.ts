import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import type {
  TalentMessageRow,
  TalentUserProfileRow,
} from "@/lib/talentOnboarding/server";

const FALLBACK_REENGAGEMENT_MESSAGE =
  "다시 이어서 이야기해볼게요. 지금 기준으로 가장 우선순위가 높은 커리어 조건이나 달라진 점이 있다면 알려주실 수 있을까요?";

function clampText(value: string | null | undefined, maxLength = 240) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function buildProfileSummary(profile: TalentUserProfileRow | null) {
  if (!profile) return "(없음)";

  const lines = [
    profile.name ? `이름: ${profile.name}` : null,
    profile.headline ? `헤드라인: ${clampText(profile.headline, 120)}` : null,
    profile.location ? `위치: ${profile.location}` : null,
    profile.bio ? `소개: ${clampText(profile.bio, 220)}` : null,
  ].filter((line): line is string => Boolean(line));

  const resumeLinks = (profile.resume_links ?? [])
    .map((link) => clampText(link, 120))
    .filter(Boolean)
    .slice(0, 4);

  if (resumeLinks.length > 0) {
    lines.push(`링크: ${resumeLinks.join(", ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : "(없음)";
}

function buildRecentConversation(messages: TalentMessageRow[]) {
  const visibleMessages = messages
    .filter((message) => clampText(message.content).length > 0)
    .slice(-8);

  if (visibleMessages.length === 0) {
    return "(최근 대화 없음)";
  }

  return visibleMessages
    .map((message) => {
      const speaker = message.role === "assistant" ? "Harper" : "User";
      const type = message.message_type ?? "chat";
      return `${speaker} (${type}): ${clampText(message.content, 220)}`;
    })
    .join("\n");
}

function normalizeReengagementMessage(content: string) {
  return content
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateTalentReengagementMessage(args: {
  displayName: string;
  hoursSinceLastChat: number;
  profile: TalentUserProfileRow | null;
  recentMessages: TalentMessageRow[];
}) {
  const { displayName, hoursSinceLastChat, profile, recentMessages } = args;

  try {
    const message = await runTalentAssistantCompletion({
      messages: [
        {
          role: "system",
          content: [
            "You are Harper, an AI career agent for talent users.",
            "Always answer in Korean.",
            "The user reopened the chat after a long pause.",
            "Write one proactive assistant message that appears before the user speaks.",
            "Rules:",
            "- Write 2-3 natural Korean sentences.",
            "- Keep it concise, warm, and specific.",
            "- Use the recent conversation and profile context if helpful.",
            "- Ask exactly one focused follow-up question.",
            "- Do not use bullet points, markdown, or quotes.",
            '- Do not mention internal mechanics like "자동 메시지", "시스템", or "24시간 이상".',
            "- Do not sound like a first-visit greeting.",
            "- If prior context is weak, ask what changed most recently in the user's priorities.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `사용자 이름: ${displayName}`,
            `직전 chat 이후 경과 시간(시간): ${hoursSinceLastChat}`,
            `프로필 요약:\n${buildProfileSummary(profile)}`,
            `최근 대화:\n${buildRecentConversation(recentMessages)}`,
          ].join("\n\n"),
        },
      ],
      temperature: 0.45,
    });

    const normalized = normalizeReengagementMessage(message);
    if (normalized) {
      return normalized;
    }
  } catch {
    // Fall through to a deterministic fallback.
  }

  return FALLBACK_REENGAGEMENT_MESSAGE;
}
