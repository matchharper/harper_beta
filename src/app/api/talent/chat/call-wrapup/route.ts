import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
} from "@/lib/talentOnboarding/server";
import {
  buildCareerCallWrapupFallbackFollowUp,
  buildCareerCallWrapupTurnInstruction,
} from "@/lib/career/prompts";
import { maybeSummarizeTalentConversation } from "@/lib/talentOnboarding/conversationSummary";
import { completeTalentOnboardingManually } from "@/lib/talentOnboarding/manualCompletion";
import { TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP } from "@/lib/talentOnboarding/onboarding";
import { runCareerChatTurn } from "@/lib/career/chatTurn";
import { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";

type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

type Body = {
  conversationId: string;
  forceCompleteOnboarding?: boolean;
  transcript: TranscriptEntry[];
  durationSeconds: number;
};

type TranscriptStats = {
  totalTurns: number;
  userTurns: number;
  userChars: number;
  assistantChars: number;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${s}초`;
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
  return content
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function insertFallbackFollowUp(args: {
  content: string;
  conversationId: string;
  supabase: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
}) {
  const now = new Date().toISOString();
  const { data: savedFollowUp, error: followUpError } = await args.supabase
    .from("talent_messages")
    .insert({
      conversation_id: args.conversationId,
      user_id: args.userId,
      role: "assistant",
      content: args.content,
      message_type: "call_wrapup",
      created_at: now,
    })
    .select("id, role, content, message_type, created_at")
    .single();

  if (followUpError) {
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
      content: args.content,
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
    const {
      conversationId,
      forceCompleteOnboarding = false,
      transcript,
      durationSeconds,
    } = body;

    if (!conversationId || !Array.isArray(transcript)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = getTalentSupabaseAdmin();
    const safeDurationSeconds = Math.max(0, Math.floor(durationSeconds ?? 0));
    const durationLabel =
      safeDurationSeconds > 0 ? formatDuration(safeDurationSeconds) : null;
    const transcriptStats = summarizeTranscript(transcript);
    if (transcriptStats.userTurns <= 0 && !forceCompleteOnboarding) {
      return NextResponse.json({
        followUpMessage: null,
        skipped: "no_user_speech",
      });
    }

    const briefConversation = isBriefConversation(
      transcriptStats,
      safeDurationSeconds
    );
    const [talentSetting, conversation, existingOnboardingWrapup] =
      await Promise.all([
        fetchTalentSetting({
          admin: supabase,
          userId: user.id,
        }),
        supabase
          .from("talent_conversations")
          .select("stage")
          .eq("id", conversationId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("talent_messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id)
          .eq("message_type", TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP)
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
    if (existingOnboardingWrapup.error) {
      console.error("[call-wrapup] Failed to read onboarding wrap-up", {
        error: existingOnboardingWrapup.error,
      });
    }
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
    if (existingOnboardingWrapup.data && !forceCompleteOnboarding) {
      return NextResponse.json({
        followUpMessage: null,
        skipped: "onboarding_completion_wrapup_exists",
      });
    }
    if (forceCompleteOnboarding) {
      const result = await completeTalentOnboardingManually({
        admin: supabase,
        conversationId,
        source: "career_call_manual_completion",
        userId: user.id,
      });
      const followUpMessage = result.wrapupMessage
        ? toTalentMessageResponse(result.wrapupMessage)
        : null;

      return NextResponse.json({
        followUpMessage,
        followUpMessages: followUpMessage ? [followUpMessage] : [],
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
    const fallbackFollowUpText = buildCareerCallWrapupFallbackFollowUp({
      isBrief: briefConversation,
      isOnboardingDone: inferredOnboardingDone,
    });
    try {
      const result = await runCareerChatTurn({
        admin: supabase,
        allowedToolNames: [TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE],
        assistantMessageType: "call_wrapup",
        conversationId,
        proactiveContext: buildCareerCallWrapupTurnInstruction({
          durationLabel,
          isBrief: briefConversation,
          isOnboardingDone: inferredOnboardingDone,
          transcript,
        }),
        userId: user.id,
      });

      const normalized = normalizeFollowUpMessage(
        result.assistantMessage?.content ?? ""
      );
      if (normalized && result.assistantMessage) {
        return NextResponse.json({
          followUpMessage: {
            ...result.assistantMessage,
            content: normalized,
          },
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
      supabase,
      userId: user.id,
    });

    return NextResponse.json({
      followUpMessage: fallbackMessage,
    });
  } catch (error) {
    console.error("[call-wrapup] Unexpected error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
