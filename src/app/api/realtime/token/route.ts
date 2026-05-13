import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
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
const REALTIME_TRANSCRIPTION_LANGUAGE = "ko";

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

function buildSafetyIdentifier(userId: string): string {
  return createHash("sha256").update(`talent-user:${userId}`).digest("hex");
}

function buildRealtimeSessionBody(args: {
  instructions: string;
  realtimeConfig: ReturnType<typeof getCareerRealtimeSessionConfig>;
  tools: ReturnType<typeof getRealtimeTools>;
  transcriptionModel: string;
}) {
  const { instructions, realtimeConfig, tools, transcriptionModel } = args;

  return {
    session: {
      type: "realtime",
      model: realtimeConfig.model,
      output_modalities: realtimeConfig.outputModalities,
      audio: {
        input: {
          transcription: {
            model: transcriptionModel,
            language: REALTIME_TRANSCRIPTION_LANGUAGE,
          },
          turn_detection: {
            type: "semantic_vad",
            create_response: true,
            interrupt_response: true,
            eagerness: "auto",
          },
          noise_reduction: { type: "near_field" },
        },
        ...(realtimeConfig.voice
          ? {
              output: {
                voice: realtimeConfig.voice,
              },
            }
          : {}),
      },
      instructions,
      ...(tools.length > 0
        ? {
            tools,
            tool_choice: "auto" as const,
          }
        : {}),
    },
  };
}

function createRealtimeClientSecret(args: {
  body: ReturnType<typeof buildRealtimeSessionBody>;
  safetyIdentifier: string;
}) {
  return fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": args.safetyIdentifier,
    },
    body: JSON.stringify(args.body),
  });
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
    const { conversationId: rawConversationId } = body as {
      conversationId?: string;
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
    const realtimeConfig = getCareerRealtimeSessionConfig();
    const safetyIdentifier = buildSafetyIdentifier(user.id);

    const response = await createRealtimeClientSecret({
      safetyIdentifier,
      body: buildRealtimeSessionBody({
        instructions,
        realtimeConfig,
        tools,
        transcriptionModel: realtimeConfig.transcriptionModel,
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      console.error("[RealtimeToken] OpenAI session creation failed:", err);
      return NextResponse.json(
        { error: "Failed to create realtime session" },
        { status: 502 }
      );
    }

    const data = await response.json();

    const token = data.value ?? data.client_secret?.value;
    if (typeof token !== "string" || token.length === 0) {
      console.error("[RealtimeToken] OpenAI response did not include a token");
      return NextResponse.json(
        { error: "Failed to create realtime client secret" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      token,
      toolVoicePreambles,
      transcriptionModel: realtimeConfig.transcriptionModel,
    });
  } catch (error) {
    console.error("[RealtimeToken] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
