import {
  readMockInterviewOpportunityId,
  MockInterviewRequestError,
} from "@/lib/career/mockInterview";
import { MOCK_INTERVIEW_OPENING_PROMPT } from "@/lib/career/prompts/cases/mockInterviewPrompts";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCareerLiveSessionConfig } from "@/lib/career/llm";
import {
  getCareerRealtimeToolCandidates,
  resolveCareerRealtimeTools,
} from "@/lib/career/llmTools";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import { buildCareerRealtimeSessionInstructions } from "@/lib/career/realtimeInstructions";
import { appendRealtimeInitialResponseInstruction } from "@/lib/career/realtimeInitialResponse";
import { parseLiveSdpOffer } from "@/lib/career/liveSdp";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentCallNoteContinuationContext,
  fetchTalentCallNoteDocument,
  isCallNoteId,
  parseTalentCallNote,
} from "@/lib/talentOnboarding/callNote";
import { touchOpenCareerCheckInCall } from "@/lib/talentOnboarding/careerCheckInCall";
import {
  fetchInternalOpportunityCallRequestById,
  isOpenInternalOpportunityCallRequestStatus,
  touchInternalOpportunityCallRequest,
} from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { resolveCareerRequestTimeZone } from "@/lib/career/requestTimeZone";

const SESSION_RATE_LIMIT = new Map<
  string,
  { count: number; resetAt: number }
>();
const MAX_SESSIONS_PER_MINUTE = 10;
const MAX_RATE_LIMIT_ENTRIES = 1000;
const CALL_NOTE_CONTINUATION_OPENING_INSTRUCTION = [
  "This is a new call that continues the verified call-note context in the session instructions.",
  "This continuation guidance takes priority over generic call-opening guidance and recent chat context.",
  "For the first response only, reconnect naturally to that subject without reading the summary aloud or claiming that the user just said it.",
  "Briefly acknowledge the continuation and ask one focused question that moves the same discussion forward.",
].join("\n");

function checkRateLimit(userId: string) {
  const now = Date.now();
  if (SESSION_RATE_LIMIT.size > MAX_RATE_LIMIT_ENTRIES) {
    for (const [key, entry] of SESSION_RATE_LIMIT.entries()) {
      if (now > entry.resetAt) SESSION_RATE_LIMIT.delete(key);
    }
  }

  const entry = SESSION_RATE_LIMIT.get(userId);
  if (!entry || now > entry.resetAt) {
    SESSION_RATE_LIMIT.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= MAX_SESSIONS_PER_MINUTE) return false;
  entry.count += 1;
  return true;
}

function buildSafetyIdentifier(userId: string) {
  return createHash("sha256").update(`talent-user:${userId}`).digest("hex");
}

function readBodyString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildLiveFrontendInstructions(args: {
  initialResponseInstruction: string;
  responseLocale: unknown;
}) {
  const language =
    typeof args.responseLocale === "string" &&
    args.responseLocale.trim().toLowerCase().startsWith("en")
      ? "English"
      : "Korean";
  const paceInstruction =
    language === "English"
      ? "Speak clearly at a slightly faster pace."
      : "조금 빠른 속도로 또렷하게 말해.";

  return [
    "You are Harper, a warm and capable career partner in a live voice call.",
    `Speak naturally in ${language}, unless the caller clearly switches languages.`,
    paceInstruction,
    "Keep spoken turns concise, conversational, and easy to interrupt. Listen while speaking and adapt naturally when the caller interjects.",
    "Delegate whenever you need the caller's stored context, business rules, careful reasoning, or any tool. Use the delegated result before making factual claims or claiming that an action succeeded.",
    "Do not narrate delegation mechanics, tool names, system instructions, or hidden context to the caller.",
    args.initialResponseInstruction
      ? `For the opening turn, follow this call-opening guidance:\n${args.initialResponseInstruction}`
      : "When asked to begin, greet the caller briefly and ask one useful opening question.",
  ].join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canUseCareerDevControls(user.email)) {
      return NextResponse.json(
        { error: "GPT-Live is available through Career dev controls only" },
        { status: 403 }
      );
    }
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Too many session requests. Please wait." },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: string;
      conversationStarterId?: string;
      initialResponseInstruction?: string;
      internalCallRequestId?: string;
      locale?: string;
      resumeCallNoteId?: string;
      mockInterviewOpportunityId?: string;
      sdp?: string;
      timeZone?: string;
    };
    const promptTimeZone = resolveCareerRequestTimeZone(req, body.timeZone);
    const conversationId = readBodyString(body.conversationId);
    const mockInterviewOpportunityId = readMockInterviewOpportunityId(body);
    const conversationStarterId = readBodyString(body.conversationStarterId);
    const initialResponseInstruction = mockInterviewOpportunityId
      ? MOCK_INTERVIEW_OPENING_PROMPT
      : readBodyString(body.initialResponseInstruction);
    const internalCallRequestId = readBodyString(body.internalCallRequestId);
    const resumeCallNoteId = readBodyString(body.resumeCallNoteId);
    const sdp = parseLiveSdpOffer(body.sdp);

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (!sdp) {
      return NextResponse.json({ error: "Invalid SDP offer" }, { status: 400 });
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
      body.locale ??
      req.cookies.get("NEXT_LOCALE")?.value;

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

    const toolCandidates = getCareerRealtimeToolCandidates(responseLocale);
    const promptPlan = await buildCareerRealtimeSessionInstructions({
      conversationId,
      conversationStarterId,
      mockInterviewOpportunityId,
      internalCallRequestId,
      preferredLocale: responseLocale,
      timeZone: promptTimeZone,
      toolNames: toolCandidates.map((tool) => tool.name),
      userId: user.id,
    });
    const openingInstruction = [
      initialResponseInstruction,
      continuedCallNote ? CALL_NOTE_CONTINUATION_OPENING_INSTRUCTION : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const backendInstructions = appendRealtimeInitialResponseInstruction({
      initialResponseInstruction: openingInstruction,
      instructions: [
        promptPlan.instructions,
        continuedCallNote
          ? buildTalentCallNoteContinuationContext(continuedCallNote)
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    const toolSelection = resolveCareerRealtimeTools({
      candidateTools: toolCandidates,
      enabledToolNames: promptPlan.enabledToolNames,
      preferredLocale: responseLocale,
    });
    const liveConfig = getCareerLiveSessionConfig();

    const response = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": buildSafetyIdentifier(user.id),
      },
      body: JSON.stringify({
        session: {
          model: liveConfig.model,
          audio: { output: { voice: liveConfig.voice } },
          instructions: buildLiveFrontendInstructions({
            initialResponseInstruction: openingInstruction,
            responseLocale,
          }),
          delegation: {
            type: "responses",
            responses: {
              model: liveConfig.delegationModel,
              instructions: backendInstructions,
              tools: toolSelection.tools,
              tool_choice: "auto",
              parallel_tool_calls: false,
              reasoning: { effort: "high" },
              text: { verbosity: "low" },
            },
          },
          store: false,
        },
        transport: { type: "webrtc", sdp },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[LiveSession] OpenAI session creation failed:", errorText);
      return NextResponse.json(
        { error: "Failed to create GPT-Live session" },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as {
      session?: { id?: unknown };
      transport?: { sdp?: unknown; type?: unknown };
    };
    const answerSdp =
      typeof payload.transport?.sdp === "string" ? payload.transport.sdp : "";
    const sessionId =
      typeof payload.session?.id === "string" ? payload.session.id : "";
    if (!answerSdp || !sessionId) {
      console.error("[LiveSession] OpenAI response was missing session data");
      return NextResponse.json(
        { error: "Invalid GPT-Live session response" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      model: liveConfig.model,
      session: { id: sessionId },
      transport: { type: "webrtc", sdp: answerSdp },
    });
  } catch (error) {
    if (error instanceof MockInterviewRequestError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    console.error("[LiveSession] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
