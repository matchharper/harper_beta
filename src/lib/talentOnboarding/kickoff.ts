import type { User } from "@supabase/supabase-js";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import type {
  TalentConversationRow,
  TalentMessageRow,
  TalentUserProfileRow,
} from "@/lib/talentOnboarding/server";
import {
  fetchTalentInsights,
  fetchTalentSetting,
  TALENT_PENDING_QUESTION_PREFIX,
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
  firstQuestion: string;
};

type TalentKickoffPreferences = {
  engagementTypes: string[];
  preferredLocations: string[];
  careerMoveIntentLabel: string | null;
  technicalStrengths: string | null;
  desiredTeams: string | null;
};

const FALLBACK_KICKOFF: LlmKickoff = {
  acknowledgement: "정보를 알려주셔서 감사합니다.",
  insight:
    "제출해주신 이력서/링크 기반으로 볼 때 강점이 분명해서 하퍼가 찾을 수 있는 기회 폭이 넓습니다.",
  firstQuestion: "가장 선호하는 역할과 포지션 레벨은 무엇인가요?",
};

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
    const firstQuestion =
      typeof parsed.firstQuestion === "string"
        ? parsed.firstQuestion.trim()
        : "";

    if (!acknowledgement || !insight || !firstQuestion) return null;
    return { acknowledgement, insight, firstQuestion };
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

  return [
    preferences.careerMoveIntentLabel
      ? `이직 의향: ${preferences.careerMoveIntentLabel}`
      : null,
    preferences.engagementTypes.length > 0
      ? `선호 형태: ${preferences.engagementTypes.join(", ")}`
      : null,
    preferences.preferredLocations.length > 0
      ? `선호 지역: ${preferences.preferredLocations.join(", ")}`
      : null,
    preferences.desiredTeams ? `원하는 팀: ${preferences.desiredTeams}` : null,
    preferences.technicalStrengths
      ? `기술적 장점: ${preferences.technicalStrengths}`
      : null,
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
  const llmRaw = await runTalentAssistantCompletion({
    messages: [
      {
        role: "system",
        content: [
          "You are Harper, an AI talent agent onboarding assistant.",
          "Always write in Korean.",
          "Return JSON only.",
          "JSON format:",
          "{",
          '  "acknowledgement": "...",',
          '  "insight": "...",',
          '  "firstQuestion": "..."',
          "}",
          "Rules:",
          '- acknowledgement should greet user naturally (e.g. "안녕하세요 OO님.") and thank for sharing.',
          '- insight should mention one impressive point using << >> wrapping style.',
          "- firstQuestion should be one concrete recruiting question.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `이름: ${args.displayName}`,
          `이력서 파일명: ${args.resumeFileName || "(없음)"}`,
          `링크: ${args.links.join(", ") || "(없음)"}`,
          `network 신청 정보: ${
            describeNetworkApplication(args.networkApplication ?? null) || "(없음)"
          }`,
          `현재 선호 정보: ${
            describeTalentPreferences(args.talentPreferences ?? null) || "(없음)"
          }`,
          `이력서 텍스트(일부): ${normalizeText(args.resumeText, 8000) || "(없음)"}`,
        ].join("\n"),
      },
    ],
    temperature: 0.25,
  });

  return parseKickoffPayload(llmRaw) ?? FALLBACK_KICKOFF;
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
      engagementTypes: engagementLabels,
      preferredLocations: locationLabels,
      careerMoveIntentLabel,
      technicalStrengths: normalizedInsights?.technical_strengths ?? null,
      desiredTeams: normalizedInsights?.desired_teams ?? null,
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
      content: `${kickoff.acknowledgement}\n\n<< ${kickoff.insight} >>`,
      message_type: "system",
    },
    {
      conversation_id: conversation.id,
      user_id: user.id,
      role: "assistant",
      content: `${TALENT_PENDING_QUESTION_PREFIX}질문 1. ${kickoff.firstQuestion}`,
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
