import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchTalentInsights,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  type TalentConversationRow,
} from "@/lib/talentOnboarding/server";
import {
  getUncoveredChecklistItems,
  INSIGHT_CHECKLIST,
} from "@/lib/talentOnboarding/insightChecklist";
import { buildRealtimeStepGuides, INTERRUPT_HANDLING_INSTRUCTION, CALL_END_INSTRUCTION } from "@/lib/talentOnboarding/interviewSteps";
import { loadPrompt, extractSection, validatePromptFile } from "@/lib/talentOnboarding/prompts";

validatePromptFile("system.md");

/**
 * Build Realtime session instructions with Harper persona + user profile context.
 * Excludes insight extraction format (handled by separate save endpoint).
 */
async function buildRealtimeInstructions(
  userId: string,
  conversationId: string
): Promise<string> {
  const admin = getTalentSupabaseAdmin();

  const [profile, currentInsights] = await Promise.all([
    fetchTalentUserProfile({ admin, userId }),
    fetchTalentInsights({ admin, userId }),
  ]);

  const structuredProfile = await fetchTalentStructuredProfile({
    admin,
    userId,
    talentUser: profile,
  });

  const structuredProfileText = buildTalentProfileContext({
    profile,
    structuredProfile,
    maxResumeChars: 3000,
  });

  const { data: conversation } = await admin
    .from("talent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  const userTurnCount = await countUserChatTurns({ admin, conversationId });

  const currentInsightContent = (currentInsights?.content ?? null) as Record<
    string,
    string
  > | null;
  const uncoveredItems = getUncoveredChecklistItems(currentInsightContent);
  const coveredCount = INSIGHT_CHECKLIST.length - uncoveredItems.length;

  const topUncovered = uncoveredItems
    .slice(0, 3)
    .map((item) => `- ${item.promptHint}`)
    .join("\n");

  const shouldSendReliefNudge =
    userTurnCount >= 5 &&
    !Boolean((conversation as TalentConversationRow | null)?.relief_nudge_sent);

  const linkText = (profile?.resume_links ?? []).join(", ");

  const currentStep: number =
    (conversation as TalentConversationRow & { current_step?: number })
      ?.current_step ?? 1;

  // Build existing insights section (capped at 1500 chars for Realtime context budget)
  let existingInsightsSection = "";
  if (currentInsightContent && Object.keys(currentInsightContent).length > 0) {
    const MAX_TOTAL = 1500;
    let section = "\n## 이미 알고 있는 정보 (재질문 금지, 더 깊은 질문에 활용)\n";
    let totalLen = section.length;
    for (const [key, value] of Object.entries(currentInsightContent).sort(([a], [b]) => a.localeCompare(b))) {
      const truncated = value.length > 120 ? value.slice(0, 120) + "..." : value;
      const line = `- ${key}: ${truncated}\n`;
      if (totalLen + line.length > MAX_TOTAL) break;
      section += line;
      totalLen += line.length;
    }
    existingInsightsSection = section;
  }

  const persona = extractSection(loadPrompt("system.md"), "persona");

  return [
    persona,
    "",
    buildRealtimeStepGuides(currentStep),
    "",
    INTERRUPT_HANDLING_INSTRUCTION,
    "",
    CALL_END_INSTRUCTION,
    "",
    existingInsightsSection,
    "",
    `Insight coverage: ${coveredCount}/${INSIGHT_CHECKLIST.length} items covered.`,
    "Prioritize naturally asking about these uncovered topics (one at a time):",
    topUncovered,
    "",
    `Current user turn count: ${userTurnCount}`,
    `Resume file: ${profile?.resume_file_name ?? "(none)"}`,
    `Resume links: ${linkText || "(none)"}`,
    structuredProfileText || "[Structured Talent Profile]\n(none)",
    "",
    shouldSendReliefNudge
      ? extractSection(loadPrompt("system.md"), "reliefNudge")
      : extractSection(loadPrompt("system.md"), "defaultGuidance"),
  ].join("\n");
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
    const conversationId = (body as { conversationId?: string })
      .conversationId?.trim();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const instructions = await buildRealtimeInstructions(
      user.id,
      conversationId
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
          model: "gpt-realtime-1.5",
          modalities: ["text", "audio"],
          voice: "coral",
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          instructions,
          turn_detection: {
            type: "server_vad",
            threshold: 0.7,
            silence_duration_ms: 800,
            prefix_padding_ms: 300,
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
    });
  } catch (error) {
    console.error("[RealtimeToken] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
