import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  fetchVisibleMessagesPage,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  getTalentToolVoicePreambles,
  getRealtimeTools,
} from "@/lib/talentOnboarding/tools";
import {
  getCareerCallEndInstructionPrompt,
  getCareerInterruptHandlingPrompt,
  buildCareerRealtimePromptPlan,
  buildCareerRealtimeRecentConversationSection,
} from "@/lib/career/prompts";
import { getCareerRealtimeSessionConfig } from "@/lib/career/llm";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";

/**
 * Build realtime instructions from the shared Harper system prompt plus
 * voice-only guidance and dynamic context.
 */
async function buildRealtimeInstructions(
  userId: string,
  conversationId: string,
  toolNames: string[]
) {
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

  const { messages: visibleMessages } = await fetchVisibleMessagesPage({
    admin,
    conversationId,
    limit: 12,
  });

  const currentInsightContent = (currentInsights?.content ?? null) as Record<
    string,
    string
  > | null;
  const promptToolNames = talentSetting?.is_onboarding_done ? toolNames : [];

  const recentConversationSection =
    buildCareerRealtimeRecentConversationSection(
      visibleMessages.map((message) => ({
        role: message.role,
        content: formatTalentMessageContentForLlmPrompt(message),
      }))
    );
  return buildCareerRealtimePromptPlan({
    callEndInstruction: getCareerCallEndInstructionPrompt(),
    currentInsightContent,
    interruptHandling: getCareerInterruptHandlingPrompt(),
    isOnboardingDone: talentSetting?.is_onboarding_done,
    profile,
    recentConversationSection,
    structuredProfileText,
    toolNames: promptToolNames,
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

    const realtimeTools = getRealtimeTools("voice");
    const realtimePromptPlan = await buildRealtimeInstructions(
      user.id,
      conversationId,
      realtimeTools.map((tool) => tool.name)
    );
    const instructions = realtimePromptPlan.instructions;
    const enabledRealtimeToolNames = new Set(
      realtimePromptPlan.enabledToolNames
    );
    const tools = realtimeTools.filter((tool) =>
      enabledRealtimeToolNames.has(tool.name)
    );
    const toolVoicePreambles =
      tools.length > 0 ? getTalentToolVoicePreambles("voice") : {};
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
