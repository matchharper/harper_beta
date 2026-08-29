import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  getCareerRealtimeToolCandidates,
  resolveCareerRealtimeTools,
  type CareerRealtimeTool,
} from "@/lib/career/llmTools";
import { getCareerRealtimeSessionConfig } from "@/lib/career/llm";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import { buildCareerRealtimeSessionInstructions } from "@/lib/career/realtimeInstructions";
import {
  fetchInternalOpportunityCallRequestById,
  isOpenInternalOpportunityCallRequestStatus,
  touchInternalOpportunityCallRequest,
} from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { appendRealtimeInitialResponseInstruction } from "@/lib/career/realtimeInitialResponse";

const TOKEN_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const MAX_TOKENS_PER_MINUTE = 10;
const MAX_RATE_LIMIT_ENTRIES = 1000;
const DEFAULT_REALTIME_TRANSCRIPTION_LANGUAGE = "ko";

function getRealtimeTranscriptionLanguage(locale: unknown) {
  if (typeof locale !== "string")
    return DEFAULT_REALTIME_TRANSCRIPTION_LANGUAGE;

  const normalized = locale.trim().toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "ko" || normalized.startsWith("ko-")) return "ko";
  return DEFAULT_REALTIME_TRANSCRIPTION_LANGUAGE;
}

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

function buildOpenAIRealtimeSessionBody(args: {
  instructions: string;
  realtimeConfig: ReturnType<typeof getCareerRealtimeSessionConfig>;
  tools: readonly CareerRealtimeTool[];
  transcriptionLanguage: string;
  transcriptionModel: string;
}) {
  const {
    instructions,
    realtimeConfig,
    tools,
    transcriptionLanguage,
    transcriptionModel,
  } = args;

  return {
    session: {
      type: "realtime",
      model: realtimeConfig.model,
      output_modalities: realtimeConfig.outputModalities,
      truncation: {
        type: "retention_ratio",
        retention_ratio: 0.8,
        token_limits: {
          post_instructions: 8000,
        },
      },
      audio: {
        input: {
          transcription: {
            model: transcriptionModel,
            language: transcriptionLanguage,
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
                speed: realtimeConfig.speechSpeed,
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

function buildXaiRealtimeClientSession(args: {
  instructions: string;
  realtimeConfig: ReturnType<typeof getCareerRealtimeSessionConfig>;
  tools: readonly CareerRealtimeTool[];
  transcriptionLanguage: string;
}) {
  const { instructions, realtimeConfig, tools, transcriptionLanguage } = args;

  return {
    instructions,
    reasoning: {
      effort: realtimeConfig.reasoningEffort ?? "high",
    },
    voice: realtimeConfig.voice,
    turn_detection: {
      type: "server_vad",
    },
    audio: {
      input: {
        format: {
          type: "audio/pcm",
          rate: 24_000,
        },
        transcription: {
          model: realtimeConfig.transcriptionModel,
          language_hint: transcriptionLanguage,
        },
      },
      output: {
        format: {
          type: "audio/pcm",
          rate: 24_000,
        },
        speed: realtimeConfig.speechSpeed,
      },
    },
    ...(tools.length > 0 ? { tools } : {}),
  };
}

function createOpenAIRealtimeClientSecret(args: {
  body: ReturnType<typeof buildOpenAIRealtimeSessionBody>;
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

function createXaiRealtimeClientSecret(apiKey: string) {
  return fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: {
        seconds: 300,
      },
    }),
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
    const {
      conversationId: rawConversationId,
      conversationStarterId: rawConversationStarterId,
      initialResponseInstruction: rawInitialResponseInstruction,
      internalCallRequestId: rawInternalCallRequestId,
      locale: rawLocale,
      providerOverride: rawProviderOverride,
    } = body as {
      conversationId?: string;
      conversationStarterId?: string;
      initialResponseInstruction?: string;
      internalCallRequestId?: string;
      locale?: string;
      providerOverride?: string;
    };
    const conversationId = rawConversationId?.trim();
    const conversationStarterId =
      typeof rawConversationStarterId === "string"
        ? rawConversationStarterId.trim()
        : "";
    const internalCallRequestId =
      typeof rawInternalCallRequestId === "string"
        ? rawInternalCallRequestId.trim()
        : "";
    const initialResponseInstruction =
      typeof rawInitialResponseInstruction === "string"
        ? rawInitialResponseInstruction
        : "";
    const providerOverride =
      canUseCareerDevControls(user.email) &&
      typeof rawProviderOverride === "string"
        ? rawProviderOverride.trim() || undefined
        : undefined;

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const talentSetting = await fetchTalentSetting({ admin, userId: user.id });
    const responseLocale =
      talentSetting?.preferred_locale ??
      rawLocale ??
      req.cookies.get("NEXT_LOCALE")?.value;
    const transcriptionLanguage =
      getRealtimeTranscriptionLanguage(responseLocale);

    if (
      conversationStarterId &&
      !getCareerConversationStarter(conversationStarterId, responseLocale)
    ) {
      return NextResponse.json(
        { error: "Invalid conversationStarterId" },
        { status: 400 }
      );
    }
    if (internalCallRequestId) {
      const callRequest = await fetchInternalOpportunityCallRequestById({
        admin,
        callId: internalCallRequestId,
        userId: user.id,
      });
      if (!callRequest) {
        return NextResponse.json(
          { error: "Invalid internalCallRequestId" },
          { status: 400 }
        );
      }
      if (!isOpenInternalOpportunityCallRequestStatus(callRequest.status)) {
        return NextResponse.json(
          { error: "Internal call already completed" },
          { status: 409 }
        );
      }
      await touchInternalOpportunityCallRequest({
        admin,
        callId: internalCallRequestId,
        userId: user.id,
      });
    }

    const realtimeToolCandidates =
      getCareerRealtimeToolCandidates(responseLocale);
    const realtimePromptPlan = await buildCareerRealtimeSessionInstructions({
      conversationId,
      conversationStarterId,
      internalCallRequestId,
      preferredLocale: responseLocale,
      toolNames: realtimeToolCandidates.map((tool) => tool.name),
      userId: user.id,
    });
    const instructions = appendRealtimeInitialResponseInstruction({
      initialResponseInstruction,
      instructions: realtimePromptPlan.instructions,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[RealtimeToken] final instructions", {
        conversationId,
        length: instructions.length,
      });
      console.log(instructions);
    }

    const realtimeToolSelection = resolveCareerRealtimeTools({
      candidateTools: realtimeToolCandidates,
      enabledToolNames: realtimePromptPlan.enabledToolNames,
      preferredLocale: responseLocale,
    });
    const tools = realtimeToolSelection.tools;
    const toolVoicePreambles = realtimeToolSelection.toolVoicePreambles;
    const realtimeConfig = getCareerRealtimeSessionConfig({
      providerOverride,
      userCreatedAt: user.created_at,
      userId: user.id,
    });
    const safetyIdentifier = buildSafetyIdentifier(user.id);

    const xaiApiKey = (
      process.env.XAI_API_KEY ?? process.env.GROK_API_KEY
    )?.trim();
    if (realtimeConfig.provider === "xai" && !xaiApiKey) {
      console.error(
        "[RealtimeToken] XAI_API_KEY or GROK_API_KEY is not configured"
      );
      return NextResponse.json(
        { error: "xAI realtime is not configured" },
        { status: 503 }
      );
    }

    const response =
      realtimeConfig.provider === "xai"
        ? await createXaiRealtimeClientSecret(xaiApiKey!)
        : await createOpenAIRealtimeClientSecret({
            safetyIdentifier,
            body: buildOpenAIRealtimeSessionBody({
              instructions,
              realtimeConfig,
              tools,
              transcriptionLanguage,
              transcriptionModel: realtimeConfig.transcriptionModel,
            }),
          });

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      console.error(
        `[RealtimeToken] ${realtimeConfig.provider} session creation failed:`,
        err
      );
      return NextResponse.json(
        { error: "Failed to create realtime session" },
        { status: 502 }
      );
    }

    const data = await response.json();

    const token = data.value ?? data.client_secret?.value;
    if (typeof token !== "string" || token.length === 0) {
      console.error(
        `[RealtimeToken] ${realtimeConfig.provider} response did not include a token`
      );
      return NextResponse.json(
        { error: "Failed to create realtime client secret" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      provider: realtimeConfig.provider,
      model: realtimeConfig.model,
      token,
      transcriptionLanguage,
      toolVoicePreambles,
      transcriptionModel: realtimeConfig.transcriptionModel,
      ...(realtimeConfig.provider === "xai"
        ? {
            session: buildXaiRealtimeClientSession({
              instructions,
              realtimeConfig,
              tools,
              transcriptionLanguage,
            }),
          }
        : {}),
    });
  } catch (error) {
    console.error("[RealtimeToken] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
