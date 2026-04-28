import type { User } from "@supabase/supabase-js";
import {
  buildCareerKickoffOpeningMessage,
  buildCareerKickoffSystemPrompt,
  buildCareerKickoffUserPrompt,
  CAREER_KICKOFF_FALLBACK,
} from "@/lib/career/prompts";
import { runCareerKickoff } from "@/lib/career/llm";
import type {
  TalentConversationRow,
  TalentInsightContent,
  TalentMessageRow,
  TalentUserProfileRow,
} from "@/lib/talentOnboarding/server";
import {
  fetchTalentInsights,
  fetchTalentSetting,
  getTalentProfileVisibilityLabel,
  TALENT_PENDING_QUESTION_PREFIX,
  normalizeTalentBlockedCompanies,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  normalizeTalentPreferredLocations,
  getTalentSupabaseAdmin,
  sanitizeTalentCareerMoveIntent,
  toTalentDisplayName,
} from "@/lib/talentOnboarding/server";
import {
  getTalentCareerMoveIntentLabel,
  getTalentEngagementLabels,
  getTalentLocationLabels,
  normalizeTalentNetworkApplication,
  type TalentNetworkApplication,
} from "@/lib/talentNetworkApplication";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type LlmKickoff = {
  acknowledgement: string;
  insight: string;
};

type TalentKickoffPreferences = {
  profileVisibilityLabel: string;
  engagementTypes: string[];
  preferredLocations: string[];
  careerMoveIntentLabel: string | null;
  blockedCompanies: string[];
  insightContent: TalentInsightContent | null;
};

export const buildTalentKickoffOpeningMessage =
  buildCareerKickoffOpeningMessage;

function parseKickoffPayload(raw: string): LlmKickoff | null {
  const normalized = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(normalized) as Partial<LlmKickoff>;
    const acknowledgement =
      typeof parsed.acknowledgement === "string"
        ? parsed.acknowledgement.trim()
        : "";
    const insight =
      typeof parsed.insight === "string" ? parsed.insight.trim() : "";

    if (!acknowledgement || !insight) return null;
    return { acknowledgement, insight };
  } catch {
    return null;
  }
}

function normalizeText(value: string | null | undefined, maxLength = 8000) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function dedupeLinks(values: Array<string | null | undefined>) {
  const unique = new Set<string>();
  const normalized: string[] = [];

  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (unique.has(value)) continue;
    unique.add(value);
    normalized.push(value);
  }

  return normalized;
}

function describeNetworkApplication(application: TalentNetworkApplication | null) {
  if (!application) return "(없음)";

  return [
    application.selectedRole
      ? `선호 역할: ${application.selectedRole}`
      : null,
    application.profileInputTypes.length > 0
      ? `제출 자료: ${application.profileInputTypes.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function describeTalentPreferences(
  preferences: TalentKickoffPreferences | null
) {
  if (!preferences) return "(없음)";

  const insightContent = preferences.insightContent ?? {};
  const priorityKeys = ["desired_teams", "technical_strengths"];
  const renderedInsightKeys = new Set<string>();
  const insightLines = priorityKeys
    .map((key) => {
      const value = insightContent[key];
      if (!value) return null;
      renderedInsightKeys.add(key);
      if (key === "desired_teams") return `원하는 팀: ${value}`;
      if (key === "technical_strengths") return `기술적 장점: ${value}`;
      return `${key}: ${value}`;
    })
    .filter(Boolean);
  for (const [key, value] of Object.entries(insightContent)) {
    if (!value || renderedInsightKeys.has(key)) continue;
    insightLines.push(`${key}: ${value}`);
  }

  return [
    `프로필 공개: ${preferences.profileVisibilityLabel}`,
    `선호 형태: ${
      preferences.engagementTypes.length > 0
        ? preferences.engagementTypes.join(", ")
        : "(없음)"
    }`,
    `이직 의향: ${preferences.careerMoveIntentLabel ?? "(미입력)"}`,
    `선호 지역: ${
      preferences.preferredLocations.length > 0
        ? preferences.preferredLocations.join(", ")
        : "(없음)"
    }`,
    `차단 기업: ${
      preferences.blockedCompanies.length > 0
        ? preferences.blockedCompanies.join(", ")
        : "(없음)"
    }`,
    ...insightLines,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateTalentKickoff(args: {
  displayName: string;
  links: string[];
  networkApplication?: TalentNetworkApplication | null;
  talentPreferences?: TalentKickoffPreferences | null;
  resumeFileName?: string | null;
  resumeText?: string | null;
}) {
  const llmRaw = await runCareerKickoff({
    messages: [
      {
        role: "system",
        content: buildCareerKickoffSystemPrompt(),
      },
      {
        role: "user",
        content: buildCareerKickoffUserPrompt({
          displayName: args.displayName,
          links: args.links,
          networkApplicationDescription: describeNetworkApplication(
            args.networkApplication ?? null
          ),
          preferencesDescription: describeTalentPreferences(
            args.talentPreferences ?? null
          ),
          resumeFileName: args.resumeFileName,
          resumeTextPreview: normalizeText(args.resumeText, 8000),
        }),
      },
    ],
  });

  return parseKickoffPayload(llmRaw) ?? CAREER_KICKOFF_FALLBACK;
}

export async function autoStartClaimedTalentConversation(args: {
  admin: AdminClient;
  conversation: TalentConversationRow;
  profile: TalentUserProfileRow | null;
  user: User;
}) {
  const { admin, conversation, profile, user } = args;
  const networkApplication = normalizeTalentNetworkApplication(
    profile?.career_profile ?? profile?.network_application
  );

  if (!profile?.network_waitlist_id || conversation.stage !== "profile") {
    return null;
  }

  const { count, error: messageCountError } = await admin
    .from("talent_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("message_type", "profile_submit");

  if (messageCountError) {
    throw new Error(
      messageCountError.message ?? "Failed to inspect onboarding messages"
    );
  }
  if ((count ?? 0) > 0) {
    return null;
  }

  const [talentSetting, talentInsights] = await Promise.all([
    fetchTalentSetting({
      admin,
      userId: user.id,
    }),
    fetchTalentInsights({
      admin,
      userId: user.id,
    }),
  ]);
  const normalizedInsights = normalizeTalentInsightContent(
    talentInsights?.content
  );
  const engagementLabels = getTalentEngagementLabels(
    normalizeTalentEngagementTypes(talentSetting?.engagement_types ?? [])
  );
  const locationLabels = getTalentLocationLabels(
    normalizeTalentPreferredLocations(talentSetting?.preferred_locations ?? [])
  );
  const careerMoveIntentLabel = getTalentCareerMoveIntentLabel(
    sanitizeTalentCareerMoveIntent(talentSetting?.career_move_intent)
  );
  const profileVisibilityLabel = getTalentProfileVisibilityLabel(
    talentSetting?.profile_visibility
  );
  const blockedCompanies = normalizeTalentBlockedCompanies(
    talentSetting?.blocked_companies ?? []
  );

  const links = dedupeLinks([
    ...(profile?.resume_links ?? []),
    networkApplication?.linkedinProfileUrl,
    networkApplication?.githubProfileUrl,
    networkApplication?.scholarProfileUrl,
    networkApplication?.personalWebsiteUrl,
  ]);
  const kickoff = await generateTalentKickoff({
    displayName: toTalentDisplayName(user),
    links,
    networkApplication,
    talentPreferences: {
      profileVisibilityLabel,
      engagementTypes: engagementLabels,
      preferredLocations: locationLabels,
      careerMoveIntentLabel,
      blockedCompanies,
      insightContent: normalizedInsights,
    },
    resumeFileName: profile?.resume_file_name,
    resumeText: profile?.resume_text,
  });

  const now = new Date().toISOString();
  const messagePayloads = [
    {
      conversation_id: conversation.id,
      user_id: user.id,
      role: "user",
      content: "기존에 제출한 정보로 커리어 워크스페이스를 시작했습니다.",
      message_type: "profile_submit",
    },
    {
      conversation_id: conversation.id,
      user_id: user.id,
      role: "assistant",
      content: `${kickoff.acknowledgement}\n\n${kickoff.insight}`,
      message_type: "system",
    },
    {
      conversation_id: conversation.id,
      user_id: user.id,
      role: "assistant",
      content: `${TALENT_PENDING_QUESTION_PREFIX}${buildTalentKickoffOpeningMessage(
        toTalentDisplayName(user)
      )}`,
      message_type: "system",
    },
  ];

  const { data: insertedMessages, error: insertError } = await admin
    .from("talent_messages")
    .insert(messagePayloads)
    .select("*");

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to seed onboarding messages");
  }

  const { data: updatedConversation, error: updateError } = await admin
    .from("talent_conversations")
    .update({
      stage: "chat",
      updated_at: now,
    })
    .eq("id", conversation.id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(updateError.message ?? "Failed to update conversation");
  }

  return {
    conversation: updatedConversation as TalentConversationRow,
    insertedMessages: (insertedMessages ?? []) as TalentMessageRow[],
  };
}
