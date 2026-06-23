import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  getCareerRealtimeToolCandidates,
  resolveCareerRealtimeTools,
  type CareerRealtimeTool,
} from "@/lib/career/llmTools";
import { getCareerRealtimeSessionConfig } from "@/lib/career/llm";
import { getCareerConversationStarterPrompt } from "@/lib/career/conversationStarterPrompts";
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

function buildRealtimeSessionBody(args: {
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
    const {
      conversationId: rawConversationId,
      conversationStarterId: rawConversationStarterId,
      internalCallRequestId: rawInternalCallRequestId,
      locale: rawLocale,
    } = body as {
      conversationId?: string;
      conversationStarterId?: string;
      internalCallRequestId?: string;
      locale?: string;
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
      !getCareerConversationStarterPrompt(conversationStarterId, responseLocale)
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
    const instructions = realtimePromptPlan.instructions;
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
    const realtimeConfig = getCareerRealtimeSessionConfig();
    const safetyIdentifier = buildSafetyIdentifier(user.id);

    const response = await createRealtimeClientSecret({
      safetyIdentifier,
      body: buildRealtimeSessionBody({
        instructions,
        realtimeConfig,
        tools,
        transcriptionLanguage,
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
      transcriptionLanguage,
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
