import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCareerMockInterviewFeedbackPrompt,
  buildCareerMockInterviewInstructionsPrompt,
  buildCareerMockInterviewOpeningQuestion,
  buildCareerMockInterviewSetupPrompt,
  CAREER_MOCK_INTERVIEW_FALLBACK_FEEDBACK_TEXT,
  CAREER_MOCK_INTERVIEW_SHORT_FEEDBACK_TEXT,
} from "@/lib/career/prompts";
import {
  runCareerMockInterviewFeedback,
  runCareerMockInterviewReply,
  runCareerMockInterviewSetup,
} from "@/lib/career/llm";
import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

export type MockInterviewType = "technical" | "fit" | "mixed";

export type MockInterviewSessionStatus =
  | "preparing"
  | "ready"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed";

export type MockInterviewSessionRow = {
  completed_at: string | null;
  company_name: string;
  conversation_id: string;
  created_at: string;
  duration_minutes: number;
  feedback_payload: Record<string, unknown>;
  id: string;
  interview_type: MockInterviewType;
  opportunity_recommendation_id: string | null;
  research_payload: Record<string, unknown>;
  role_id: string | null;
  role_title: string;
  setup_payload: Record<string, unknown>;
  started_at: string | null;
  status: MockInterviewSessionStatus;
  talent_id: string;
  updated_at: string;
};

export type MockInterviewSetupPayload = {
  companyName: string;
  durationMinutes: number;
  feedback: string;
  focus: string;
  goal: string;
  interviewTypes: Array<{ id: MockInterviewType; label: string }>;
  roleTitle: string;
  sessionId: string;
  subtitle: string;
  title: string;
};

type OpportunityContext = {
  companyDescription: string | null;
  companyName: string;
  description: string | null;
  externalJdUrl: string | null;
  opportunityId: string | null;
  recommendationReasons: string[];
  roleId: string | null;
  roleTitle: string;
};

type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

const MOCK_INTERVIEW_TYPES: MockInterviewSetupPayload["interviewTypes"] = [
  { id: "technical", label: "테크니컬 인터뷰" },
  { id: "fit", label: "핏 인터뷰" },
  { id: "mixed", label: "둘 다" },
];

export const MOCK_INTERVIEW_PREPARING_MESSAGE_TYPE = "mock_interview_preparing";
export const MOCK_INTERVIEW_SETUP_MESSAGE_TYPE = "mock_interview_setup";
export const MOCK_INTERVIEW_MESSAGE_TYPE = "mock_interview";
export const MOCK_INTERVIEW_FEEDBACK_MESSAGE_TYPE = "mock_interview_feedback";

export function normalizeMockInterviewType(value: unknown): MockInterviewType {
  if (value === "technical" || value === "fit" || value === "mixed") {
    return value;
  }
  return "mixed";
}

export function parseMockInterviewSetupPayload(
  content: string
): MockInterviewSetupPayload | null {
  try {
    const parsed = JSON.parse(content) as Partial<MockInterviewSetupPayload>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.sessionId !== "string" || !parsed.sessionId) return null;
    if (typeof parsed.companyName !== "string") return null;
    if (typeof parsed.roleTitle !== "string") return null;

    const fallbackFeedback =
      "답변 구조와 기술 설명의 명확성에 대해 바로 피드백을 드릴게요.";
    const fallbackFocus =
      "역할에서 중요하게 보는 부분과 회원님의 관련 경험을 중심으로 연습합니다.";
    const fallbackGoal =
      "지원 동기, 자기소개, 역할 관련 깊이 있는 답변을 실제 인터뷰처럼 연습합니다.";
    const fallbackSubtitle = `${parsed.companyName} 인터뷰를 함께 준비해볼게요.`;
    const fallbackTitle = "모의 인터뷰 준비하기";

    return {
      companyName: parsed.companyName,
      durationMinutes:
        typeof parsed.durationMinutes === "number"
          ? parsed.durationMinutes
          : 15,
      feedback: koreanOrFallback(parsed.feedback, fallbackFeedback),
      focus: koreanOrFallback(parsed.focus, fallbackFocus),
      goal: koreanOrFallback(parsed.goal, fallbackGoal),
      interviewTypes: MOCK_INTERVIEW_TYPES,
      roleTitle: parsed.roleTitle,
      sessionId: parsed.sessionId,
      subtitle: koreanOrFallback(parsed.subtitle, fallbackSubtitle),
      title: koreanOrFallback(parsed.title, fallbackTitle),
    };
  } catch {
    return null;
  }
}

export function serializeMockInterviewSession(
  session: MockInterviewSessionRow | null
) {
  if (!session) return null;

  return {
    companyName: session.company_name,
    completedAt: session.completed_at,
    conversationId: session.conversation_id,
    createdAt: session.created_at,
    durationMinutes: session.duration_minutes,
    id: session.id,
    interviewType: session.interview_type,
    opportunityId: session.opportunity_recommendation_id,
    roleId: session.role_id,
    roleTitle: session.role_title,
    setup: parseSetupFromRecord(session.setup_payload),
    startedAt: session.started_at,
    status: session.status,
  };
}

export function toMockInterviewResponseMessage(item: TalentMessageRow) {
  const setup =
    item.message_type === MOCK_INTERVIEW_SETUP_MESSAGE_TYPE
      ? parseMockInterviewSetupPayload(item.content)
      : null;

  return {
    id: item.id,
    role: item.role,
    content: setup ? setup.title : item.content,
    messageType: item.message_type ?? "chat",
    createdAt: item.created_at,
    mockInterviewSetup: setup,
  };
}

export async function fetchActiveMockInterviewSession(args: {
  admin: AdminClient;
  conversationId: string;
  statuses?: MockInterviewSessionStatus[];
  userId: string;
}) {
  const statuses = args.statuses ?? ["preparing", "ready", "in_progress"];
  const { data, error } = await ((
    args.admin.from("talent_mock_interview_session" as any) as any
  )
    .select("*")
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load mock interview session");
  }
  return (data ?? null) as MockInterviewSessionRow | null;
}

export async function prepareMockInterview(args: {
  admin: AdminClient;
  companyName?: string | null;
  conversationId: string;
  opportunityId?: string | null;
  roleTitle?: string | null;
  sourceMessage?: string | null;
  userId: string;
}) {
  const opportunity = await fetchOpportunityContext({
    admin: args.admin,
    companyName: args.companyName ?? null,
    opportunityId: args.opportunityId ?? null,
    roleTitle: args.roleTitle ?? null,
    sourceMessage: args.sourceMessage ?? null,
    userId: args.userId,
  });
  const now = new Date().toISOString();

  const { data: session, error: sessionError } = await ((
    args.admin.from("talent_mock_interview_session" as any) as any
  )
    .insert({
      company_name: opportunity.companyName,
      conversation_id: args.conversationId,
      duration_minutes: 15,
      interview_type: "mixed",
      opportunity_recommendation_id: opportunity.opportunityId,
      role_id: opportunity.roleId,
      role_title: opportunity.roleTitle,
      status: "preparing",
      talent_id: args.userId,
    })
    .select("*")
    .single() as any);

  if (sessionError) {
    throw new Error(sessionError.message ?? "Failed to create mock interview");
  }

  const { data: preparingMessage, error: preparingError } = await args.admin
    .from("talent_messages")
    .insert({
      content: "인터뷰 준비 중...",
      conversation_id: args.conversationId,
      created_at: now,
      message_type: MOCK_INTERVIEW_PREPARING_MESSAGE_TYPE,
      role: "assistant",
      user_id: args.userId,
    })
    .select("*")
    .single();

  if (preparingError) {
    throw new Error(
      preparingError.message ?? "Failed to create preparing message"
    );
  }

  const [profileContext, research] = await Promise.all([
    buildProfileContext({
      admin: args.admin,
      userId: args.userId,
    }),
    researchMockInterview({
      companyName: opportunity.companyName,
      roleTitle: opportunity.roleTitle,
    }),
  ]);

  const setupPayload = await buildSetupPayload({
    opportunity,
    profileContext,
    research,
    sessionId: String(session.id),
  });

  const { data: updatedSession, error: updateError } = await ((
    args.admin.from("talent_mock_interview_session" as any) as any
  )
    .update({
      research_payload: research,
      setup_payload: setupPayload,
      status: "ready",
    })
    .eq("id", session.id)
    .eq("talent_id", args.userId)
    .select("*")
    .single() as any);

  if (updateError) {
    throw new Error(updateError.message ?? "Failed to update mock interview");
  }

  const { data: setupMessage, error: setupError } = await args.admin
    .from("talent_messages")
    .update({
      content: JSON.stringify(setupPayload),
      message_type: MOCK_INTERVIEW_SETUP_MESSAGE_TYPE,
    })
    .eq("id", preparingMessage.id)
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .select("*")
    .single();

  if (setupError) {
    throw new Error(setupError.message ?? "Failed to create setup message");
  }

  await touchConversation(args.admin, args.conversationId, args.userId);

  return {
    messages: [
      toMockInterviewResponseMessage(setupMessage as TalentMessageRow),
    ],
    session: serializeMockInterviewSession(
      updatedSession as MockInterviewSessionRow
    ),
  };
}

export async function startMockInterview(args: {
  admin: AdminClient;
  channel: "call" | "chat";
  conversationId: string;
  interviewType?: MockInterviewType;
  sessionId: string;
  userId: string;
}) {
  const interviewType = normalizeMockInterviewType(args.interviewType);
  const session = await fetchOwnedMockInterviewSession(args);
  const now = new Date().toISOString();
  const openingText = buildOpeningQuestion({
    session,
  });

  const { data: updatedSession, error: updateError } = await ((
    args.admin.from("talent_mock_interview_session" as any) as any
  )
    .update({
      interview_type: interviewType,
      started_at: session.started_at ?? now,
      status: "in_progress",
    })
    .eq("id", args.sessionId)
    .eq("talent_id", args.userId)
    .select("*")
    .single() as any);

  if (updateError) {
    throw new Error(updateError.message ?? "Failed to start mock interview");
  }

  const { data: message, error: messageError } = await args.admin
    .from("talent_messages")
    .insert({
      content: openingText,
      conversation_id: args.conversationId,
      message_type: MOCK_INTERVIEW_MESSAGE_TYPE,
      role: "assistant",
      user_id: args.userId,
    })
    .select("*")
    .single();

  if (messageError) {
    throw new Error(messageError.message ?? "Failed to create opening message");
  }

  await touchConversation(args.admin, args.conversationId, args.userId);

  return {
    message: toMockInterviewResponseMessage(message as TalentMessageRow),
    session: serializeMockInterviewSession(
      updatedSession as MockInterviewSessionRow
    ),
  };
}

export async function buildMockInterviewReply(args: {
  admin: AdminClient;
  conversationId: string;
  userMessage: string;
  userId: string;
}) {
  const session = await fetchActiveMockInterviewSession({
    admin: args.admin,
    conversationId: args.conversationId,
    statuses: ["in_progress"],
    userId: args.userId,
  });
  if (!session) return null;

  const activeSession = getActiveInterviewSession(session);

  const recentMessages = await fetchRecentMockMessages({
    admin: args.admin,
    conversationId: args.conversationId,
    since: activeSession.started_at ?? activeSession.created_at,
  });

  const instructions = await buildMockInterviewChatInstructions({
    admin: args.admin,
    session: activeSession,
    userId: args.userId,
  });

  const responseText = await runCareerMockInterviewReply({
    messages: [
      { role: "system", content: instructions },
      ...recentMessages
        .slice(-12)
        .map((item) => ({
          role: item.role as "user" | "assistant",
          content: item.content,
        }))
        .filter((item) => item.role === "user" || item.role === "assistant"),
      { role: "user", content: args.userMessage },
    ],
  });

  return (
    responseText.trim() ||
    "좋습니다. 방금 답변에서 가장 중요한 의사결정 포인트를 하나만 더 구체적으로 설명해 주세요."
  );
}

export async function completeMockInterview(args: {
  admin: AdminClient;
  conversationId: string;
  extraTranscript?: TranscriptEntry[];
  sessionId?: string | null;
  userId: string;
}) {
  const session = args.sessionId
    ? await fetchOwnedMockInterviewSession({
        admin: args.admin,
        conversationId: args.conversationId,
        sessionId: args.sessionId,
        userId: args.userId,
      })
    : await fetchActiveMockInterviewSession({
        admin: args.admin,
        conversationId: args.conversationId,
        statuses: ["in_progress"],
        userId: args.userId,
      });

  if (!session) return null;

  const transcript = await buildTranscriptForFeedback({
    admin: args.admin,
    conversationId: args.conversationId,
    extraTranscript: args.extraTranscript ?? [],
    since: session.started_at ?? session.created_at,
  });
  const feedbackText = await buildFeedbackText({ session, transcript });
  const now = new Date().toISOString();

  const { data: message, error: messageError } = await args.admin
    .from("talent_messages")
    .insert({
      content: feedbackText,
      conversation_id: args.conversationId,
      created_at: now,
      message_type: MOCK_INTERVIEW_FEEDBACK_MESSAGE_TYPE,
      role: "assistant",
      user_id: args.userId,
    })
    .select("*")
    .single();

  if (messageError) {
    throw new Error(
      messageError.message ?? "Failed to create feedback message"
    );
  }

  const { data: updatedSession, error: updateError } = await ((
    args.admin.from("talent_mock_interview_session" as any) as any
  )
    .update({
      completed_at: now,
      feedback_payload: {
        transcriptTurns: transcript.length,
        userTurns: transcript.filter((item) => item.role === "user").length,
      },
      status: "completed",
    })
    .eq("id", session.id)
    .eq("talent_id", args.userId)
    .select("*")
    .single() as any);

  if (updateError) {
    throw new Error(updateError.message ?? "Failed to complete mock interview");
  }

  await touchConversation(args.admin, args.conversationId, args.userId);

  return {
    message: toMockInterviewResponseMessage(message as TalentMessageRow),
    session: serializeMockInterviewSession(
      updatedSession as MockInterviewSessionRow
    ),
  };
}

export async function buildRealtimeMockInterviewInstructions(args: {
  admin: AdminClient;
  conversationId: string;
  userId: string;
}) {
  const session = await fetchActiveMockInterviewSession({
    admin: args.admin,
    conversationId: args.conversationId,
    statuses: ["in_progress"],
    userId: args.userId,
  });
  if (!session) return null;

  return buildMockInterviewChatInstructions({
    admin: args.admin,
    session,
    userId: args.userId,
    voice: true,
  });
}

async function fetchOwnedMockInterviewSession(args: {
  admin: AdminClient;
  conversationId: string;
  sessionId: string;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_mock_interview_session" as any) as any
  )
    .select("*")
    .eq("id", args.sessionId)
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .maybeSingle() as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load mock interview");
  }
  if (!data) throw new Error("Mock interview not found");
  return data as MockInterviewSessionRow;
}

async function fetchOpportunityContext(args: {
  admin: AdminClient;
  companyName: string | null;
  opportunityId: string | null;
  roleTitle: string | null;
  sourceMessage: string | null;
  userId: string;
}): Promise<OpportunityContext> {
  const explicitCompanyName = normalizeSentence(args.companyName);
  const explicitRoleTitle = normalizeSentence(args.roleTitle);

  if (!args.opportunityId && (explicitCompanyName || explicitRoleTitle)) {
    return {
      companyDescription: null,
      companyName: explicitCompanyName || "the company",
      description: null,
      externalJdUrl: null,
      opportunityId: null,
      recommendationReasons: [],
      roleId: null,
      roleTitle: explicitRoleTitle || "the role",
    };
  }

  let query = (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      `
        id,
        role_id,
        recommendation_reasons,
        company_role:company_roles (
          role_id,
          name,
          description,
          external_jd_url,
          company_workspace:company_workspace (
            company_name,
            company_description
          )
        )
      `
    )
    .eq("talent_id", args.userId);

  query = args.opportunityId
    ? query.eq("id", args.opportunityId).limit(1)
    : query.order("recommended_at", { ascending: false }).limit(1);

  const { data, error } = (await query.maybeSingle()) as any;
  if (error) {
    throw new Error(error.message ?? "Failed to load opportunity");
  }

  const role = data?.company_role;
  const workspace = role?.company_workspace;
  if (role && workspace) {
    return {
      companyDescription: workspace.company_description ?? null,
      companyName: String(workspace.company_name ?? "the company"),
      description: role.description ?? null,
      externalJdUrl: role.external_jd_url ?? null,
      opportunityId: String(data.id ?? ""),
      recommendationReasons: normalizeStringArray(data.recommendation_reasons),
      roleId: role.role_id ? String(role.role_id) : null,
      roleTitle: String(role.name ?? "the role"),
    };
  }

  return {
    companyDescription: null,
    companyName: "the company",
    description: null,
    externalJdUrl: null,
    opportunityId: null,
    recommendationReasons: [],
    roleId: null,
    roleTitle: "the role",
  };
}

async function buildProfileContext(args: {
  admin: AdminClient;
  userId: string;
}) {
  const [profile, insights, setting] = await Promise.all([
    fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
    fetchTalentInsights({ admin: args.admin, userId: args.userId }),
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
  ]);
  const structuredProfile = await fetchTalentStructuredProfile({
    admin: args.admin,
    talentUser: profile,
    userId: args.userId,
  });

  return {
    insights: insights?.content ?? {},
    profileText: buildTalentProfileContext({
      profile,
      setting,
      structuredProfile,
      maxResumeChars: 2600,
    }),
  };
}

async function researchMockInterview(args: {
  companyName: string;
  roleTitle: string;
}) {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) {
    return {
      provider: "none",
      queries: [],
      results: [],
      skippedReason: "BRAVE_SEARCH_API_KEY is not configured.",
    };
  }

  const queries = [
    `${args.companyName} ${args.roleTitle} interview questions`,
    `${args.companyName} interview experience machine learning`,
    `${args.companyName} ${args.roleTitle} hiring process`,
  ];

  const results: Array<{
    description: string | null;
    title: string;
    url: string;
  }> = [];

  for (const query of queries) {
    const params = new URLSearchParams({
      count: "5",
      q: query,
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?${params}`,
        {
          headers: {
            accept: "application/json",
            "x-subscription-token": key,
          },
          signal: controller.signal,
        }
      );
      if (!response.ok) continue;
      const payload = (await response.json().catch(() => ({}))) as {
        web?: {
          results?: Array<{
            description?: string;
            title?: string;
            url?: string;
          }>;
        };
      };

      for (const result of payload.web?.results ?? []) {
        const url = String(result.url ?? "").trim();
        const title = String(result.title ?? "").trim();
        if (!url || !title) continue;
        results.push({
          description: String(result.description ?? "").trim() || null,
          title,
          url,
        });
      }
    } catch {
      // Search is supplemental. JD/profile context should still produce a setup.
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    provider: "brave",
    queries,
    results: dedupeBy(results, (item) => item.url).slice(0, 10),
  };
}

async function buildSetupPayload(args: {
  opportunity: OpportunityContext;
  profileContext: { insights: unknown; profileText: string };
  research: Record<string, unknown>;
  sessionId: string;
}): Promise<MockInterviewSetupPayload> {
  const fallback = buildFallbackSetupPayload(args);

  try {
    const prompt = buildCareerMockInterviewSetupPrompt({
      companyName: args.opportunity.companyName,
      description: args.opportunity.description,
      profileText: args.profileContext.profileText,
      recommendationReasons: args.opportunity.recommendationReasons,
      research: args.research,
      roleTitle: args.opportunity.roleTitle,
    });

    const rawSetup = await runCareerMockInterviewSetup({ prompt });
    const parsed = JSON.parse(rawSetup || "{}") as {
      feedback?: string;
      focus?: string;
      goal?: string;
    };

    return {
      ...fallback,
      feedback: koreanOrFallback(parsed.feedback, fallback.feedback),
      focus: koreanOrFallback(parsed.focus, fallback.focus),
      goal: koreanOrFallback(parsed.goal, fallback.goal),
    };
  } catch {
    return fallback;
  }
}

function buildFallbackSetupPayload(args: {
  opportunity: OpportunityContext;
  sessionId: string;
}): MockInterviewSetupPayload {
  return {
    companyName: args.opportunity.companyName,
    durationMinutes: 15,
    feedback: "답변 구조, 설득력, 기술 설명의 명확성에 대해 바로 피드백합니다.",
    focus: `${args.opportunity.roleTitle} 역할에 맞춰 회원님의 관련 경험, 역할 이해도, 깊이 있는 설명 방식을 함께 점검합니다.`,
    goal: "실제 인터뷰처럼 자기소개, 지원 동기, 역할 관련 깊이 있는 답변을 연습합니다.",
    interviewTypes: MOCK_INTERVIEW_TYPES,
    roleTitle: args.opportunity.roleTitle,
    sessionId: args.sessionId,
    subtitle: `${args.opportunity.companyName} 인터뷰를 함께 준비해볼게요.`,
    title: "모의 인터뷰 준비하기",
  };
}

async function buildMockInterviewChatInstructions(args: {
  admin: AdminClient;
  session: MockInterviewSessionRow;
  userId: string;
  voice?: boolean;
}) {
  const profileContext = await buildProfileContext({
    admin: args.admin,
    userId: args.userId,
  });
  const setup = parseSetupFromRecord(args.session.setup_payload);
  const typeLabel =
    args.session.interview_type === "technical"
      ? "테크니컬 인터뷰"
      : args.session.interview_type === "fit"
        ? "핏 인터뷰"
        : "테크니컬과 핏을 함께 보는 인터뷰";

  return buildCareerMockInterviewInstructionsPrompt({
    candidateProfileText: profileContext.profileText,
    companyName: args.session.company_name,
    durationMinutes: args.session.duration_minutes,
    feedbackPromise: setup?.feedback ?? "",
    focus: setup?.focus ?? "",
    goal: setup?.goal ?? "",
    researchPayload: args.session.research_payload ?? {},
    roleTitle: args.session.role_title,
    typeLabel,
    voice: args.voice,
  });
}

function buildOpeningQuestion(args: { session: MockInterviewSessionRow }) {
  return buildCareerMockInterviewOpeningQuestion({
    companyName: args.session.company_name,
    roleTitle: args.session.role_title,
  });
}

async function buildFeedbackText(args: {
  session: MockInterviewSessionRow;
  transcript: TranscriptEntry[];
}) {
  const userTurns = args.transcript.filter((item) => item.role === "user");
  const userChars = userTurns.reduce((sum, item) => sum + item.text.length, 0);

  if (userTurns.length < 2 || userChars < 180) {
    return CAREER_MOCK_INTERVIEW_SHORT_FEEDBACK_TEXT;
  }

  const transcriptText = args.transcript
    .map((item) => `${item.role === "user" ? "User" : "Harper"}: ${item.text}`)
    .join("\n")
    .slice(0, 7000);

  try {
    const feedbackText = await runCareerMockInterviewFeedback({
      prompt: buildCareerMockInterviewFeedbackPrompt({
        companyName: args.session.company_name,
        roleTitle: args.session.role_title,
        transcriptText,
      }),
    });

    return feedbackText.trim() || CAREER_MOCK_INTERVIEW_FALLBACK_FEEDBACK_TEXT;
  } catch {
    return CAREER_MOCK_INTERVIEW_FALLBACK_FEEDBACK_TEXT;
  }
}

async function fetchRecentMockMessages(args: {
  admin: AdminClient;
  conversationId: string;
  since: string;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("role, content, message_type, created_at")
    .eq("conversation_id", args.conversationId)
    .gte("created_at", args.since)
    .in("message_type", [MOCK_INTERVIEW_MESSAGE_TYPE, "call_transcript"])
    .order("created_at", { ascending: true })
    .limit(40);

  if (error) {
    throw new Error(error.message ?? "Failed to load mock interview messages");
  }
  return Array.isArray(data) ? data : [];
}

async function buildTranscriptForFeedback(args: {
  admin: AdminClient;
  conversationId: string;
  extraTranscript: TranscriptEntry[];
  since: string;
}) {
  const rows = await fetchRecentMockMessages(args);
  const fromDb = rows
    .map((row) => ({
      role: row.role === "user" ? "user" : "assistant",
      text: String(row.content ?? "").trim(),
    }))
    .filter((item): item is TranscriptEntry =>
      Boolean(item.text && (item.role === "user" || item.role === "assistant"))
    );

  return [
    ...fromDb,
    ...args.extraTranscript.filter((item) => item.text.trim()),
  ];
}

function parseSetupFromRecord(
  value: Record<string, unknown> | null | undefined
) {
  if (!value || typeof value !== "object") return null;
  return parseMockInterviewSetupPayload(JSON.stringify(value));
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.values(value)
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeSentence(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasKorean(value: string) {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value);
}

function koreanOrFallback(value: unknown, fallback: string) {
  const normalized = normalizeSentence(value);
  return normalized && hasKorean(normalized) ? normalized : fallback;
}

function getActiveInterviewSession(session: MockInterviewSessionRow) {
  return session;
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function touchConversation(
  admin: SupabaseClient<any>,
  conversationId: string,
  userId: string
) {
  await admin
    .from("talent_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId);
}
