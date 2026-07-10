import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistCoverage,
  getOnboardingChecklistCoverageStats,
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
} from "@/lib/talentOnboarding/server";
import {
  buildCareerCallWrapupFallbackFollowUp,
  buildCareerCallWrapupTurnInstruction,
  buildInternalOpportunityCallWrapupInstruction,
} from "@/lib/career/prompts";
import {
  completeInternalOpportunityCallRequest,
  fetchInternalOpportunityCallRequestById,
  fetchPendingInternalOpportunityCallRequests,
  isOpenInternalOpportunityCallRequestStatus,
} from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import { maybeSummarizeTalentConversation } from "@/lib/talentOnboarding/conversationSummary";
import { completeTalentOnboardingManually } from "@/lib/talentOnboarding/manualCompletion";
import { runCareerChatTurn } from "@/lib/career/chatTurn";
import { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  sanitizeSingleLineDbText,
  stripPostgresUnsafeChars,
} from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";

type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

type Body = {
  conversationStarterId?: string | null;
  conversationId: string;
  forceCompleteOnboarding?: boolean;
  internalCallRequestId?: string | null;
  locale?: string | null;
  transcript: TranscriptEntry[];
  durationSeconds: number;
};

type TranscriptStats = {
  totalTurns: number;
  userTurns: number;
  userChars: number;
  assistantChars: number;
};

const CALL_TRANSCRIPT_MESSAGE_TYPE = "call_transcript";
const CALL_WRAPUP_MESSAGE_TYPE = "call_wrapup";
const CALL_TRANSCRIPT_FALLBACK_LOOKBACK_MS = 60 * 60 * 1000;

function formatDuration(
  seconds: number,
  preferredLocale?: string | null
): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return careerT(preferredLocale, "career.call.duration", "{m}분 {s}초", {
    values: { m, s },
  });
}

function normalizeTranscriptEntries(entries: unknown): TranscriptEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as { role?: unknown; text?: unknown };
      const role = record.role === "user" ? "user" : "assistant";
      const text = stripPostgresUnsafeChars(String(record.text ?? "")).trim();
      if (!text) return null;
      return { role, text };
    })
    .filter((entry): entry is TranscriptEntry => entry !== null);
}

function summarizeTranscript(transcript: TranscriptEntry[]): TranscriptStats {
  return transcript.reduce<TranscriptStats>(
    (stats, entry) => {
      const text = String(entry.text ?? "").trim();
      if (!text) return stats;

      stats.totalTurns += 1;
      if (entry.role === "user") {
        stats.userTurns += 1;
        stats.userChars += text.length;
      } else {
        stats.assistantChars += text.length;
      }
      return stats;
    },
    {
      totalTurns: 0,
      userTurns: 0,
      userChars: 0,
      assistantChars: 0,
    }
  );
}

async function fetchSavedCallTranscript(args: {
  conversationId: string;
  supabase: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
}) {
  const { data: latestWrapup, error: latestWrapupError } = await args.supabase
    .from("talent_messages")
    .select("id")
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("message_type", CALL_WRAPUP_MESSAGE_TYPE)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestWrapupError) {
    console.error("[call-wrapup] Failed to read latest call wrap-up", {
      error: latestWrapupError,
    });
  }

  let query = args.supabase
    .from("talent_messages")
    .select("id, role, content")
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("message_type", CALL_TRANSCRIPT_MESSAGE_TYPE)
    .gte(
      "created_at",
      new Date(Date.now() - CALL_TRANSCRIPT_FALLBACK_LOOKBACK_MS).toISOString()
    )
    .in("role", ["user", "assistant"])
    .order("id", { ascending: true })
    .limit(80);

  if (latestWrapup?.id) {
    query = query.gt("id", latestWrapup.id);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[call-wrapup] Failed to read saved call transcript", {
      error,
    });
    return [];
  }

  return normalizeTranscriptEntries(
    (data ?? []).map((row) => ({
      role: row.role,
      text: row.content,
    }))
  );
}

function isBriefConversation(
  stats: TranscriptStats,
  durationSeconds: number
): boolean {
  if (stats.userTurns <= 0) return true;
  if (stats.userTurns === 1) return true;
  if (stats.userChars < 80) return true;
  if (durationSeconds > 0 && durationSeconds < 50) return true;
  return false;
}

function normalizeFollowUpMessage(content: string): string {
  return stripPostgresUnsafeChars(content)
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildInternalOpportunityInterruptedFollowUp(args: {
  companyName: string;
  preferredLocale?: string | null;
  roleTitle: string;
}) {
  return careerT(
    args.preferredLocale,
    "career.call.internal_interrupted_followup",
    "{companyName} {roleTitle} 관련 통화가 중간에 끊긴 것 같아요. 연결은 계속 진행 중이고, 이어서 이야기하고 싶으시면 채팅이 아니라 Home 화면의 통화 카드에서 다시 진행해주세요.",
    { values: { companyName: args.companyName, roleTitle: args.roleTitle } }
  );
}

function buildInternalOpportunityFallbackFollowUp(args: {
  companyName: string;
  isBrief: boolean;
  preferredLocale?: string | null;
  roleTitle: string;
}) {
  if (args.isBrief) {
    return careerT(
      args.preferredLocale,
      "career.call.internal_brief_followup",
      "{companyName} {roleTitle} 관련 통화가 조금 짧게 끝난 것 같아요. 연결은 계속 진행 중이고, 더 이야기하고 싶으시면 Home 화면의 통화 카드에서 이어서 진행해주세요.",
      { values: { companyName: args.companyName, roleTitle: args.roleTitle } }
    );
  }

  return careerT(
    args.preferredLocale,
    "career.call.internal_completed_followup",
    "{companyName} {roleTitle} 관련해서 들려주신 내용은 회사 측에 전달할 때 잘 반영해둘게요. 연결은 계속 진행 중입니다.",
    { values: { companyName: args.companyName, roleTitle: args.roleTitle } }
  );
}

async function insertFallbackFollowUp(args: {
  content: string;
  conversationId: string;
  isMobile?: boolean | null;
  supabase: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
}) {
  const now = new Date().toISOString();
  const { data: savedFollowUp, error: followUpError } = await args.supabase
    .from("talent_messages")
    .insert(
      withIsMobile(
        {
          conversation_id: args.conversationId,
          user_id: args.userId,
          role: "assistant",
          content: stripPostgresUnsafeChars(args.content),
          message_type: "call_wrapup",
          created_at: now,
        },
        args.isMobile
      )
    )
    .select("id, role, content, message_type, created_at")
    .single();

  if (followUpError) {
    await notifyUnsupportedUnicodeEscapeError({
      conversationId: args.conversationId,
      error: followUpError,
      metadata: {
        contentLength: args.content.length,
        messageType: "call_wrapup",
      },
      route: "/api/talent/chat/call-wrapup",
      stage: "talent_messages.insert:fallback_follow_up",
      userId: args.userId,
    });
    console.error("[call-wrapup] Failed to save fallback follow-up message", {
      error: followUpError,
    });
  } else {
    void maybeSummarizeTalentConversation({
      admin: args.supabase,
      conversationId: args.conversationId,
      userId: args.userId,
    }).catch((error) => {
      console.error("[call-wrapup] Failed to summarize conversation", {
        conversationId: args.conversationId,
        error: error instanceof Error ? error.message : String(error),
        userId: args.userId,
      });
    });
  }

  return (
    savedFollowUp ?? {
      id: `followup-${Date.now()}`,
      role: "assistant",
      content: stripPostgresUnsafeChars(args.content),
      messageType: "call_wrapup",
      createdAt: now,
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const isMobile = isMobileRequest(request);
    const {
      conversationStarterId: rawConversationStarterId,
      forceCompleteOnboarding = false,
      internalCallRequestId: rawInternalCallRequestId,
      transcript,
      durationSeconds,
    } = body;
    const conversationId = sanitizeSingleLineDbText(body.conversationId, 80);
    const conversationStarterId =
      typeof rawConversationStarterId === "string"
        ? (sanitizeSingleLineDbText(rawConversationStarterId, 120) ?? "")
        : "";
    const internalCallRequestId =
      typeof rawInternalCallRequestId === "string"
        ? (sanitizeSingleLineDbText(rawInternalCallRequestId, 120) ?? "")
        : "";

    if (!conversationId || !Array.isArray(transcript)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = getTalentSupabaseAdmin();
    const internalCallRequest = internalCallRequestId
      ? await fetchInternalOpportunityCallRequestById({
          admin: supabase,
          callId: internalCallRequestId,
          userId: user.id,
        })
      : null;
    if (
      internalCallRequestId &&
      (!internalCallRequest ||
        !isOpenInternalOpportunityCallRequestStatus(internalCallRequest.status))
    ) {
      return NextResponse.json(
        { error: "Invalid internalCallRequestId" },
        { status: 400 }
      );
    }
    const safeDurationSeconds = Math.max(0, Math.floor(durationSeconds ?? 0));
    const requestTranscript = normalizeTranscriptEntries(transcript);
    const [talentSetting, currentInsights, profile, conversation] =
      await Promise.all([
        fetchTalentSetting({
          admin: supabase,
          userId: user.id,
        }),
        fetchTalentInsights({
          admin: supabase,
          userId: user.id,
        }),
        fetchTalentUserProfile({
          admin: supabase,
          userId: user.id,
        }),
        supabase
          .from("talent_conversations")
          .select("stage")
          .eq("id", conversationId)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
    const responseLocale =
      talentSetting?.preferred_locale ??
      body.locale ??
      request.cookies.get("NEXT_LOCALE")?.value;
    const conversationStarter = conversationStarterId
      ? getCareerConversationStarter(
          conversationStarterId,
          responseLocale
        )
      : null;
    const skipConversationWrites = Boolean(conversationStarter);
    if (conversationStarterId && !conversationStarter) {
      return NextResponse.json(
        { error: "Invalid conversationStarterId" },
        { status: 400 }
      );
    }
    const durationLabel =
      safeDurationSeconds > 0
        ? formatDuration(safeDurationSeconds, responseLocale)
        : null;
    if (conversation.error) {
      return NextResponse.json(
        { error: conversation.error.message ?? "Failed to read conversation" },
        { status: 500 }
      );
    }
    if (!conversation.data) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const requestTranscriptStats = summarizeTranscript(requestTranscript);
    const savedTranscript =
      requestTranscriptStats.userTurns <= 0
        ? await fetchSavedCallTranscript({
            conversationId,
            supabase,
            userId: user.id,
          })
        : [];
    const resolvedTranscript =
      requestTranscriptStats.userTurns > 0
        ? requestTranscript
        : savedTranscript;
    const transcriptStats = summarizeTranscript(resolvedTranscript);
    if (transcriptStats.userTurns <= 0 && !forceCompleteOnboarding) {
      if (internalCallRequest) {
        const fallbackMessage = await insertFallbackFollowUp({
          content: buildInternalOpportunityInterruptedFollowUp({
            companyName: internalCallRequest.companyName,
            preferredLocale: responseLocale,
            roleTitle: internalCallRequest.roleTitle,
          }),
          conversationId,
          isMobile,
          supabase,
          userId: user.id,
        });

        const pendingInternalOpportunityCallRequests =
          await fetchPendingInternalOpportunityCallRequests({
            admin: supabase,
            userId: user.id,
          });

        return NextResponse.json({
          followUpMessage: fallbackMessage,
          followUpMessages: [fallbackMessage],
          pendingInternalOpportunityCallRequest:
            pendingInternalOpportunityCallRequests[0] ?? null,
          pendingInternalOpportunityCallRequests,
        });
      }

      return NextResponse.json({
        followUpMessage: null,
        skipped: "no_user_speech",
      });
    }

    const briefConversation = isBriefConversation(
      transcriptStats,
      safeDurationSeconds
    );
    const currentInsightContent = (currentInsights?.content ?? null) as Record<
      string,
      string
    > | null;
    const coverageCompletion =
      !forceCompleteOnboarding &&
      !skipConversationWrites &&
      !internalCallRequest &&
      !Boolean(talentSetting?.is_onboarding_done)
        ? getOnboardingChecklistCoverageStats(
            await getCareerOnboardingChecklistCoverage({
              admin: supabase,
              conversationId,
              currentInsightContent,
              userId: user.id,
            }),
            profile
          ).isComplete
        : false;
    if (coverageCompletion) {
      const result = await completeTalentOnboardingManually({
        admin: supabase,
        completionReason: "question_checklist_covered",
        conversationId,
        isMobile,
        source: "career_call_checklist_completion",
        userId: user.id,
      });
      const followUpMessage = result.wrapupMessage
        ? toTalentMessageResponse(result.wrapupMessage)
        : null;
      const nextStepsMessage = result.nextStepsMessage
        ? toTalentMessageResponse(result.nextStepsMessage)
        : null;
      const followUpMessages = [followUpMessage, nextStepsMessage].filter(
        (message): message is ReturnType<typeof toTalentMessageResponse> =>
          message !== null
      );

      return NextResponse.json({
        followUpMessage,
        followUpMessages,
        insightUpdatedAt: result.insightUpdatedAt,
        opportunityDiscoveryQueued: result.opportunityDiscoveryQueued,
        opportunityRun: result.opportunityRun,
        progress: {
          completed: true,
        },
        talentInsights: result.talentInsights,
      });
    }
    if (
      forceCompleteOnboarding &&
      !skipConversationWrites &&
      !internalCallRequest
    ) {
      const result = await completeTalentOnboardingManually({
        admin: supabase,
        conversationId,
        isMobile,
        source: "career_call_manual_completion",
        userId: user.id,
      });
      const followUpMessage = result.wrapupMessage
        ? toTalentMessageResponse(result.wrapupMessage)
        : null;
      const nextStepsMessage = result.nextStepsMessage
        ? toTalentMessageResponse(result.nextStepsMessage)
        : null;
      const followUpMessages = [followUpMessage, nextStepsMessage].filter(
        (message): message is ReturnType<typeof toTalentMessageResponse> =>
          message !== null
      );

      return NextResponse.json({
        followUpMessage,
        followUpMessages,
        insightUpdatedAt: result.insightUpdatedAt,
        opportunityDiscoveryQueued: result.opportunityDiscoveryQueued,
        opportunityRun: result.opportunityRun,
        progress: {
          completed: true,
        },
        talentInsights: result.talentInsights,
      });
    }
    const inferredOnboardingDone =
      Boolean(talentSetting?.is_onboarding_done) ||
      conversation.data?.stage === "completed";
    const fallbackFollowUpText = internalCallRequest
      ? buildInternalOpportunityFallbackFollowUp({
          companyName: internalCallRequest.companyName,
          isBrief: briefConversation,
          preferredLocale: responseLocale,
          roleTitle: internalCallRequest.roleTitle,
        })
      : buildCareerCallWrapupFallbackFollowUp({
          isBrief: briefConversation,
          isOnboardingDone: inferredOnboardingDone,
          preferredLocale: responseLocale,
        });
    try {
      const result = await runCareerChatTurn({
        admin: supabase,
        allowedToolNames: [
          TALENT_TOOL_NAMES.UPDATE_SETTING,
          TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
        ],
        assistantMessageType: "call_wrapup",
        conversationId,
        inlineInsightExtraction: true,
        isMobile,
        proactiveContext: internalCallRequest
          ? buildInternalOpportunityCallWrapupInstruction({
              callRequest: internalCallRequest,
              durationLabel,
              isBrief: briefConversation,
              preferredLocale: responseLocale,
              transcript: resolvedTranscript,
            })
          : buildCareerCallWrapupTurnInstruction({
              durationLabel,
              isBrief: briefConversation,
              isOnboardingDone: inferredOnboardingDone,
              preferredLocale: responseLocale,
              transcript: resolvedTranscript,
            }),
        skipConversationWrites,
        usageLabel: internalCallRequest
          ? "career/chat:internal_opportunity_call_wrapup"
          : "career/chat:call_wrapup",
        userId: user.id,
      });

      const normalized = normalizeFollowUpMessage(
        result.assistantMessage?.content ?? ""
      );
      if (normalized && result.assistantMessage) {
        if (internalCallRequest && !briefConversation) {
          await completeInternalOpportunityCallRequest({
            admin: supabase,
            callId: internalCallRequest.id,
            userId: user.id,
          });
        }
        const pendingInternalOpportunityCallRequests = internalCallRequest
          ? await fetchPendingInternalOpportunityCallRequests({
              admin: supabase,
              userId: user.id,
            })
          : undefined;
        const followUpMessage = {
          ...result.assistantMessage,
          content: normalized,
        };
        return NextResponse.json({
          followUpMessage,
          followUpMessages: [followUpMessage],
          insightUpdatedAt: result.insightUpdatedAt,
          opportunityDiscoveryQueued: result.opportunityDiscoveryQueued,
          opportunityRun: result.opportunityRun,
          pendingInternalOpportunityCallRequest: internalCallRequest
            ? (pendingInternalOpportunityCallRequests?.[0] ?? null)
            : undefined,
          pendingInternalOpportunityCallRequests,
          preferencesUpdatedAt: result.preferencesUpdatedAt,
          progress: result.progress,
          talentInsights: result.talentInsights,
          talentPreferences: result.talentPreferences,
          talentProfile: result.talentProfile,
        });
      }
    } catch (error) {
      console.error("[call-wrapup] Failed to generate chat-turn follow-up", {
        error,
      });
    }

    const fallbackMessage = await insertFallbackFollowUp({
      content: fallbackFollowUpText,
      conversationId,
      isMobile,
      supabase,
      userId: user.id,
    });
    if (internalCallRequest && !briefConversation) {
      await completeInternalOpportunityCallRequest({
        admin: supabase,
        callId: internalCallRequest.id,
        userId: user.id,
      });
    }
    const pendingInternalOpportunityCallRequests = internalCallRequest
      ? await fetchPendingInternalOpportunityCallRequests({
          admin: supabase,
          userId: user.id,
        })
      : undefined;

    return NextResponse.json({
      followUpMessage: fallbackMessage,
      followUpMessages: [fallbackMessage],
      pendingInternalOpportunityCallRequest: internalCallRequest
        ? (pendingInternalOpportunityCallRequests?.[0] ?? null)
        : undefined,
      pendingInternalOpportunityCallRequests,
    });
  } catch (error) {
    console.error("[call-wrapup] Unexpected error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
