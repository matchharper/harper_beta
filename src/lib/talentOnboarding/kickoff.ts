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
  TalentStructuredProfile,
  TalentUserProfileRow,
} from "@/lib/talentOnboarding/server";
import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  getTalentProfileVisibilityLabel,
  TALENT_PENDING_QUESTION_PREFIX,
  normalizeTalentBlockedCompanies,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  getTalentSupabaseAdmin,
  sanitizeTalentCareerMoveIntent,
  toTalentDisplayName,
} from "@/lib/talentOnboarding/server";
import {
  getTalentCareerMoveIntentLabel,
  getTalentEngagementLabels,
} from "@/lib/talentNetworkOptions";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type LlmKickoff = {
  acknowledgement: string;
  insight: string;
};

type TalentKickoffPreferences = {
  profileVisibilityLabel: string;
  engagementTypes: string[];
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

function hasText(value: string | null | undefined) {
  return String(value ?? "").trim().length > 0;
}

function hasStoredProfileSeed(profile: TalentUserProfileRow | null) {
  if (!profile) return false;

  return Boolean(
    profile.network_waitlist_id ||
    hasText(profile.resume_file_name) ||
    hasText(profile.resume_storage_path) ||
    hasText(profile.resume_text) ||
    hasText(profile.headline) ||
    hasText(profile.bio) ||
    hasText(profile.location) ||
    (profile.resume_links ?? []).some((link) => hasText(link))
  );
}

function hasStructuredProfileSeed(profile: TalentStructuredProfile | null) {
  if (!profile) return false;
  return (
    profile.talentExperiences.length > 0 ||
    profile.talentEducations.length > 0 ||
    profile.talentExtras.length > 0
  );
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
  if (!profile || conversation.stage !== "profile") {
    return null;
  }

  let structuredProfile: TalentStructuredProfile | null = null;
  const hasStoredSeed = hasStoredProfileSeed(profile);
  if (!hasStoredSeed) {
    structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    if (!hasStructuredProfileSeed(structuredProfile)) {
      return null;
    }
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

  const [talentSetting, talentInsights, promptProfile] = await Promise.all([
    fetchTalentSetting({
      admin,
      userId: user.id,
    }),
    fetchTalentInsights({
      admin,
      userId: user.id,
    }),
    structuredProfile
      ? Promise.resolve(structuredProfile)
      : fetchTalentStructuredProfile({
          admin,
          userId: user.id,
          talentUser: profile,
        }),
  ]);
  const normalizedInsights = normalizeTalentInsightContent(
    talentInsights?.content
  );
  const engagementLabels = getTalentEngagementLabels(
    normalizeTalentEngagementTypes(talentSetting?.engagement_types ?? [])
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

  const links = dedupeLinks([...(profile?.resume_links ?? [])]);
  const profileContext = buildTalentProfileContext({
    includeResumeText: false,
    profile,
    setting: talentSetting,
    structuredProfile: promptProfile,
  });
  const resumeTextForKickoff = [profile?.resume_text, profileContext]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  const kickoff = await generateTalentKickoff({
    displayName: toTalentDisplayName(user),
    links,
    talentPreferences: {
      profileVisibilityLabel,
      engagementTypes: engagementLabels,
      careerMoveIntentLabel,
      blockedCompanies,
      insightContent: normalizedInsights,
    },
    resumeFileName: profile?.resume_file_name,
    resumeText: resumeTextForKickoff,
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
    throw new Error(
      insertError.message ?? "Failed to seed onboarding messages"
    );
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
