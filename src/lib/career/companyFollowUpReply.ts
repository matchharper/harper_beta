import { runCareerChatTurn } from "@/lib/career/chatTurn";
import {
  fetchTalentCompanyWatchlistDetail,
  type TalentCompanyWatchlistItem,
} from "@/lib/career/companyWatchlist";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import {
  fetchTalentSetting,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";

export const TALENT_MESSAGE_TYPE_COMPANY_FOLLOW_UP = "company_follow_followup";

function buildCompanyFollowUpInstruction(args: {
  item: TalentCompanyWatchlistItem;
  preferredLocale?: string | null;
}) {
  const item = args.item;
  const outputLanguage = getCareerPromptLanguageName(args.preferredLocale);
  const details = [
    item.shortDescription ? `Short description: ${item.shortDescription}` : "",
    item.location ? `Location: ${item.location}` : "",
    item.specialities.length > 0
      ? `Specialities: ${item.specialities.slice(0, 6).join(", ")}`
      : "",
  ].filter(Boolean);

  return [
    "## Company follow proactive assistant turn",
    `The user followed company "${item.name}" from Career Watchlist. They did not send a new chat message.`,
    details.length > 0 ? details.join("\n") : "",
    "",
    `Write the next assistant message in ${outputLanguage}.`,
    "Do not mention triggers, timers, events, logs, systems, or implementation details.",
    "Do not open with a long explanation of Watchlist mechanics.",
    "Keep it to 1-2 natural sentences.",
    "Acknowledge the saved interest and say Harper will remember this direction when tracking relevant company changes or future matching.",
    "Ask no question unless one very specific missing preference would materially improve future matching.",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export async function createTalentCompanyFollowFollowUpReply(args: {
  admin: TalentAdminClient;
  companyDbId: number;
  conversationId: string | null;
  isMobile?: boolean | null;
  userId: string;
}) {
  const conversationId = String(args.conversationId ?? "").trim();
  const companyDbId = Number(args.companyDbId);
  if (!conversationId || !Number.isFinite(companyDbId) || companyDbId <= 0) {
    return null;
  }

  const talentSetting = await fetchTalentSetting({
    admin: args.admin,
    userId: args.userId,
  });
  const preferredLocale = talentSetting?.preferred_locale ?? null;
  const item = await fetchTalentCompanyWatchlistDetail({
    admin: args.admin,
    companyDbId,
    preferredLocale,
    userId: args.userId,
  });
  if (!item?.following) return null;

  const result = await runCareerChatTurn({
    admin: args.admin,
    allowedToolNames: [],
    assistantMessageType: TALENT_MESSAGE_TYPE_COMPANY_FOLLOW_UP,
    conversationId,
    isMobile: args.isMobile,
    pendingOpportunityFeedbackContext: "",
    proactiveContext: buildCompanyFollowUpInstruction({
      item,
      preferredLocale,
    }),
    shouldInsertAssistantMessage: async () => {
      const latestItem = await fetchTalentCompanyWatchlistDetail({
        admin: args.admin,
        companyDbId,
        preferredLocale,
        userId: args.userId,
      });
      return Boolean(latestItem?.following);
    },
    userId: args.userId,
  });

  return result.assistantMessage;
}
