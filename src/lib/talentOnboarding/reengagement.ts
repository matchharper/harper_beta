import {
  buildCareerReengagementSystemPrompt,
  buildCareerReengagementUserPrompt,
  CAREER_REENGAGEMENT_FALLBACK_MESSAGE,
} from "@/lib/career/prompts";
import { runCareerReengagementMessage } from "@/lib/career/llm";
import type {
  TalentMessageRow,
  TalentUserProfileRow,
} from "@/lib/talentOnboarding/server";
import type { TalentActivityEventRow } from "@/lib/talentOnboarding/activityEvents";

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

function buildRecentActivity(events: TalentActivityEventRow[] | undefined) {
  const visibleEvents = (events ?? [])
    .filter((event) => clampText(event.summary).length > 0)
    .slice(0, 8);

  if (visibleEvents.length === 0) {
    return "(최근 활동 없음)";
  }

  return visibleEvents
    .map(
      (event) =>
        `${event.occurred_at}: ${clampText(event.summary, 260)} (impact: ${
          event.impact_level
        })`
    )
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
  recentActivityEvents?: TalentActivityEventRow[];
  recentMessages: TalentMessageRow[];
}) {
  const {
    displayName,
    hoursSinceLastChat,
    profile,
    recentActivityEvents,
    recentMessages,
  } = args;

  try {
    const message = await runCareerReengagementMessage({
      messages: [
        {
          role: "system",
          content: buildCareerReengagementSystemPrompt(),
        },
        {
          role: "user",
          content: buildCareerReengagementUserPrompt({
            displayName,
            hoursSinceLastChat,
            profileSummary: buildProfileSummary(profile),
            recentActivity: buildRecentActivity(recentActivityEvents),
            recentConversation: buildRecentConversation(recentMessages),
          }),
        },
      ],
    });

    const normalized = normalizeReengagementMessage(message);
    if (normalized) {
      return normalized;
    }
  } catch {
    // Fall through to a deterministic fallback.
  }

  return CAREER_REENGAGEMENT_FALLBACK_MESSAGE;
}
