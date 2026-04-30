import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchVisibleMessagesPage,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  getUncoveredChecklistItems,
  INSIGHT_CHECKLIST,
} from "@/lib/talentOnboarding/insightChecklist";
import { TALENT_INTERVIEW_MIN_COVERAGE } from "@/lib/talentOnboarding/progress";
import { warmCache } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  buildTalentToolPolicy,
  getTalentToolVoicePreambles,
  getRealtimeTools,
} from "@/lib/talentOnboarding/tools";
import { buildRealtimeMockInterviewInstructions } from "@/lib/mockInterview/server";
import {
  getCareerCallEndInstructionPrompt,
  getCareerInterruptHandlingPrompt,
  buildCareerRealtimeInstructionsPrompt,
  buildCareerRealtimeRecentConversationSection,
} from "@/lib/career/prompts";
import { getCareerRealtimeSessionConfig } from "@/lib/career/llm";

/**
 * Build realtime instructions from the shared Harper system prompt plus
 * voice-only guidance and dynamic context.
 */
async function buildRealtimeInstructions(
  userId: string,
  conversationId: string
): Promise<string> {
  await warmCache();

  const admin = getTalentSupabaseAdmin();

  const [profile, currentInsights, talentSetting] = await Promise.all([
    fetchTalentUserProfile({ admin, userId }),
    fetchTalentInsights({ admin, userId }),
    fetchTalentSetting({ admin, userId }),
  ]);

  const structuredProfile = await fetchTalentStructuredProfile({
    admin,
    userId,
    talentUser: profile,
  });

  const structuredProfileText = buildTalentProfileContext({
    profile,
    structuredProfile,
    setting: talentSetting,
    maxResumeChars: 3000,
  });

  const userTurnCount = await countUserChatTurns({ admin, conversationId });
  const { messages: visibleMessages } = await fetchVisibleMessagesPage({
    admin,
    conversationId,
    limit: 12,
  });

  const currentInsightContent = (currentInsights?.content ?? null) as Record<
    string,
    string
  > | null;
  const uncoveredItems = getUncoveredChecklistItems(currentInsightContent);
  const coveredCount = INSIGHT_CHECKLIST.length - uncoveredItems.length;
  const coverageRatio =
    INSIGHT_CHECKLIST.length > 0 ? coveredCount / INSIGHT_CHECKLIST.length : 1;
  const thresholdPercent = Math.round(TALENT_INTERVIEW_MIN_COVERAGE * 100);
  const shouldWrapUpNow = coverageRatio >= TALENT_INTERVIEW_MIN_COVERAGE;

  const recentConversationSection =
    buildCareerRealtimeRecentConversationSection(
      visibleMessages.map((message) => ({
        role: message.role,
        content: message.content,
      }))
    );
  const toolPolicy = buildTalentToolPolicy("voice");

  return buildCareerRealtimeInstructionsPrompt({
    callEndInstruction: getCareerCallEndInstructionPrompt(),
    coveredCount,
    currentInsightContent,
    interruptHandling: getCareerInterruptHandlingPrompt(),
    isOnboardingDone: talentSetting?.is_onboarding_done,
    profile,
    recentConversationSection,
    shouldWrapUpNow,
    structuredProfileText,
    thresholdPercent,
    toolPolicy,
    totalInsightCount: INSIGHT_CHECKLIST.length,
    uncoveredItems,
    userTurnCount,
  });
}

const TOKEN_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const MAX_TOKENS_PER_MINUTE = 10;
const MAX_RATE_LIMIT_ENTRIES = 1000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();

  // Evict stale entries periodically to prevent memory leaks
  if (TOKEN_RATE_LIMIT.size > MAX_RATE_LIMIT_ENTRIES) {
    Array.from(TOKEN_RATE_LIMIT.entries()).forEach(([key, e]) => {
      if (now > e.resetAt) TOKEN_RATE_LIMIT.delete(key);
    });
  }

  const entry = TOKEN_RATE_LIMIT.get(userId);
  if (!entry || now > entry.resetAt) {
    TOKEN_RATE_LIMIT.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= MAX_TOKENS_PER_MINUTE) {
    return false;
  }
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Too many token requests. Please wait." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { conversationId: rawConversationId, useElevenLabsTts } = body as {
      conversationId?: string;
      useElevenLabsTts?: boolean;
    };
    const conversationId = rawConversationId?.trim();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const mockInterviewInstructions =
      await buildRealtimeMockInterviewInstructions({
        admin: getTalentSupabaseAdmin(),
        conversationId,
        userId: user.id,
      });
    const instructions =
      mockInterviewInstructions ??
      (await buildRealtimeInstructions(user.id, conversationId));
    const tools = mockInterviewInstructions ? [] : getRealtimeTools("voice");
    const toolVoicePreambles = mockInterviewInstructions
      ? {}
      : getTalentToolVoicePreambles("voice");
    const realtimeConfig = getCareerRealtimeSessionConfig(
      Boolean(useElevenLabsTts)
    );

    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: realtimeConfig.model,
          modalities: realtimeConfig.modalities,
          ...(realtimeConfig.voice ? { voice: realtimeConfig.voice } : {}),
          input_audio_transcription: {
            model: realtimeConfig.transcriptionModel,
          },
          instructions,
          ...(tools.length > 0
            ? {
                tools,
                tool_choice: "auto" as const,
              }
            : {}),
          turn_detection: {
            type: "semantic_vad",
            create_response: true,
            interrupt_response: true,
            eagerness: "auto",
          },
          input_audio_noise_reduction: { type: "near_field" },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      console.error("[RealtimeToken] OpenAI session creation failed:", err);
      return NextResponse.json(
        { error: "Failed to create realtime session" },
        { status: 502 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      token: data.client_secret.value,
      expiresAt: data.client_secret.expires_at,
      sessionId: data.id,
      toolVoicePreambles,
    });
  } catch (error) {
    console.error("[RealtimeToken] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
