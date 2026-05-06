import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  buildCareerCallWrapupFallbackFollowUp,
  buildCareerCallWrapupPrompt,
} from "@/lib/career/prompts";
import { runCareerCallWrapup } from "@/lib/career/llm";
import { maybeSummarizeTalentConversation } from "@/lib/talentOnboarding/conversationSummary";
import { TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP } from "@/lib/talentOnboarding/onboarding";

type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

type Body = {
  conversationId: string;
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

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const { conversationId, transcript, durationSeconds } = body;

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
    if (existingOnboardingWrapup.data) {
      return NextResponse.json({
        followUpMessage: null,
        skipped: "onboarding_completion_wrapup_exists",
      });
    }
    const inferredOnboardingDone =
      Boolean(talentSetting?.is_onboarding_done) ||
      conversation.data?.stage === "completed";

    let followUpText = buildCareerCallWrapupFallbackFollowUp({
      isBrief: briefConversation,
      isOnboardingDone: inferredOnboardingDone,
    });

    try {
      const prompt = buildCareerCallWrapupPrompt({
        transcript,
        durationLabel,
        isBrief: briefConversation,
        isOnboardingDone: inferredOnboardingDone,
      });

      const content = await runCareerCallWrapup({ prompt });
      const normalized = normalizeFollowUpMessage(content);
      if (normalized) {
        followUpText = normalized;
      }
    } catch (error) {
      console.error("[call-wrapup] Failed to generate follow-up", { error });
    }

    const now = new Date().toISOString();

    const followUpRow = {
      conversation_id: conversationId,
      user_id: user.id,
      role: "assistant",
      content: followUpText,
      message_type: "call_wrapup",
      created_at: now,
    };

    const { data: savedFollowUp, error: followUpError } = await supabase
      .from("talent_messages")
      .insert(followUpRow)
      .select("id, role, content, message_type, created_at")
      .single();

    if (followUpError) {
      console.error("[call-wrapup] Failed to save follow-up message", {
        error: followUpError,
      });
    } else {
      void maybeSummarizeTalentConversation({
        admin: supabase,
        conversationId,
        userId: user.id,
      }).catch((error) => {
        console.error("[call-wrapup] Failed to summarize conversation", {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
        });
      });
    }

    return NextResponse.json({
      followUpMessage: savedFollowUp ?? {
        id: `followup-${Date.now()}`,
        role: "assistant",
        content: followUpText,
        messageType: "call_wrapup",
        createdAt: now,
      },
    });
  } catch (error) {
    console.error("[call-wrapup] Unexpected error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
