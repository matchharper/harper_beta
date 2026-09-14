import {
  readMockInterviewOpportunityId,
  MockInterviewRequestError,
} from "@/lib/career/mockInterview";
import { MOCK_INTERVIEW_OPENING_PROMPT } from "@/lib/career/prompts/cases/mockInterviewPrompts";
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
import { appendRealtimeInitialResponseInstruction } from "@/lib/career/realtimeInitialResponse";
import { touchOpenCareerCheckInCall } from "@/lib/talentOnboarding/careerCheckInCall";
import {
  buildTalentCallNoteContinuationContext,
  fetchTalentCallNoteDocument,
  isCallNoteId,
  parseTalentCallNote,
} from "@/lib/talentOnboarding/callNote";

const TOKEN_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const MAX_TOKENS_PER_MINUTE = 10;
const MAX_RATE_LIMIT_ENTRIES = 1000;
const DEFAULT_REALTIME_TRANSCRIPTION_LANGUAGE = "ko";
const CALL_NOTE_CONTINUATION_OPENING_INSTRUCTION = [
  "This is a new call that continues the verified call-note context in the session instructions.",
  "This continuation guidance takes priority over generic call-opening guidance and recent chat context.",
  "For the first response only, reconnect naturally to that subject without reading the summary aloud or claiming that the user just said it.",
  "Briefly acknowledge the continuation and ask one focused question that moves the same discussion forward.",
].join("\n");

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
      resumeCallNoteId: rawResumeCallNoteId,
      locale: rawLocale,
    } = body as {
      conversationId?: string;
      conversationStarterId?: string;
      initialResponseInstruction?: string;
      internalCallRequestId?: string;
      resumeCallNoteId?: string;
      mockInterviewOpportunityId?: string;
      locale?: string;
    };
    const mockInterviewOpportunityId = readMockInterviewOpportunityId(body);
    const conversationId = rawConversationId?.trim();
    const conversationStarterId =
      typeof rawConversationStarterId === "string"
        ? rawConversationStarterId.trim()
        : "";
    const internalCallRequestId =
      typeof rawInternalCallRequestId === "string"
        ? rawInternalCallRequestId.trim()
        : "";
    const initialResponseInstruction = mockInterviewOpportunityId
      ? MOCK_INTERVIEW_OPENING_PROMPT
      : typeof rawInitialResponseInstruction === "string"
        ? rawInitialResponseInstruction
        : "";
    const resumeCallNoteId =
      typeof rawResumeCallNoteId === "string" ? rawResumeCallNoteId.trim() : "";

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (resumeCallNoteId && !isCallNoteId(resumeCallNoteId)) {
      return NextResponse.json(
        { error: "Invalid resumeCallNoteId" },
        { status: 400 }
      );
    }
    if (resumeCallNoteId && (conversationStarterId || internalCallRequestId)) {
      return NextResponse.json(
        { error: "A continued call note cannot use another call objective" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const continuedCallNoteDocument = resumeCallNoteId
      ? await fetchTalentCallNoteDocument({
          admin,
          documentId: resumeCallNoteId,
          userId: user.id,
        })
      : null;
    if (resumeCallNoteId && !continuedCallNoteDocument) {
      return NextResponse.json(
        { error: "Call note not found" },
        { status: 404 }
      );
    }
    const continuedCallNote = continuedCallNoteDocument
      ? parseTalentCallNote(continuedCallNoteDocument.extracted_text)
      : null;
    if (resumeCallNoteId && !continuedCallNote) {
      return NextResponse.json(
        { error: "Call note data is invalid" },
        { status: 422 }
      );
    }
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
    if (conversationStarterId === "career_check_in") {
      const careerCheckInCall = await touchOpenCareerCheckInCall({
        admin,
        conversationId,
        userId: user.id,
      });
      if (!careerCheckInCall) {
        return NextResponse.json(
          { error: "No pending career check-in call" },
          { status: 409 }
        );
      }
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
      mockInterviewOpportunityId,
      internalCallRequestId,
      preferredLocale: responseLocale,
      toolNames: realtimeToolCandidates.map((tool) => tool.name),
      userId: user.id,
    });
    const instructions = appendRealtimeInitialResponseInstruction({
      initialResponseInstruction: [
        initialResponseInstruction,
        continuedCallNote ? CALL_NOTE_CONTINUATION_OPENING_INSTRUCTION : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      instructions: [
        realtimePromptPlan.instructions,
        continuedCallNote
          ? buildTalentCallNoteContinuationContext(continuedCallNote)
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
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
    const realtimeConfig = getCareerRealtimeSessionConfig();
    const safetyIdentifier = buildSafetyIdentifier(user.id);
    const response = await createOpenAIRealtimeClientSecret({
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
      provider: realtimeConfig.provider,
      model: realtimeConfig.model,
      token,
      transcriptionLanguage,
      toolVoicePreambles,
      transcriptionModel: realtimeConfig.transcriptionModel,
    });
  } catch (error) {
    if (error instanceof MockInterviewRequestError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    console.error("[RealtimeToken] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
