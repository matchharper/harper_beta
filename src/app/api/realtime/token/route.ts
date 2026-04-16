import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchVisibleMessagesPage,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  getUncoveredChecklistItems,
  INSIGHT_CHECKLIST,
} from "@/lib/talentOnboarding/insightChecklist";
import { TALENT_INTERVIEW_MIN_COVERAGE } from "@/lib/talentOnboarding/progress";
import { getInterruptHandling, getCallEndInstruction } from "@/lib/talentOnboarding/interviewSteps";
import { warmCache, getTestFlagSlugs, getContentForUser } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  buildTalentToolPolicy,
  getTalentToolVoicePreambles,
  getRealtimeTools,
} from "@/lib/talentOnboarding/tools";

function buildRecentConversationSection(
  messages: Array<{
    role: string;
    content: string;
  }>
) {
  const recentMessages = messages.filter((message) => message.content.trim());
  if (recentMessages.length === 0) return "";

  const MAX_TOTAL = 2200;
  const MAX_PER_MESSAGE = 280;
  let section =
    "\n## 최근 대화 내역 (이전 흐름을 이어서 자연스럽게 대화)\n";
  let totalLength = section.length;

  for (const message of recentMessages) {
    const roleLabel = message.role === "assistant" ? "Harper" : "사용자";
    const normalizedContent = message.content.replace(/\s+/g, " ").trim();
    const truncatedContent =
      normalizedContent.length > MAX_PER_MESSAGE
        ? `${normalizedContent.slice(0, MAX_PER_MESSAGE)}...`
        : normalizedContent;
    const line = `- ${roleLabel}: ${truncatedContent}\n`;

    if (totalLength + line.length > MAX_TOTAL) break;
    section += line;
    totalLength += line.length;
  }

  section +=
    "위 대화의 마지막 맥락에서 이어서 말하고, 이미 한 소개나 질문을 처음부터 반복하지 마라.";
  return section;
}

/**
 * Load the flat career-chat prompt from DB and inject channel_type + dynamic context.
 */
async function buildRealtimeInstructions(
  userId: string,
  conversationId: string
): Promise<string> {
  await warmCache();
  const testSlugs = await getTestFlagSlugs(userId);

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

  const userTurnCount = await countUserChatTurns({ admin, conversationId });
  const { messages: visibleMessages } = await fetchVisibleMessagesPage({
    admin,
    conversationId,
    limit: 12,
  });

  const currentInsightContent = (currentInsights?.content ?? null) as Record<
    string,
    string
  > | null;
  const uncoveredItems = getUncoveredChecklistItems(currentInsightContent);
  const coveredCount = INSIGHT_CHECKLIST.length - uncoveredItems.length;
  const coverageRatio =
    INSIGHT_CHECKLIST.length > 0 ? coveredCount / INSIGHT_CHECKLIST.length : 1;
  const thresholdPercent = Math.round(TALENT_INTERVIEW_MIN_COVERAGE * 100);
  const shouldWrapUpNow = coverageRatio >= TALENT_INTERVIEW_MIN_COVERAGE;

  const topUncovered = uncoveredItems
    .slice(0, 3)
    .map((item) => `- ${item.promptHint}`)
    .join("\n");

  const linkText = (profile?.resume_links ?? []).join(", ");
  const recentConversationSection = buildRecentConversationSection(
    visibleMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }))
  );
  const toolPolicy = buildTalentToolPolicy("voice");

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

  // Load flat prompt from DB and inject channel type
  const flatPrompt = getContentForUser("career-chat", testSlugs) ?? "";
  const prompt = flatPrompt.replace(/\{channel_type\}/g, "Voice");

  return [
    prompt,
    "",
    getInterruptHandling(),
    "",
    getCallEndInstruction(),
    "",
    toolPolicy,
    "",
    existingInsightsSection,
    "",
    recentConversationSection,
    "",
    `Insight coverage: ${coveredCount}/${INSIGHT_CHECKLIST.length} items covered.`,
    `Completion threshold: ${thresholdPercent}% coverage.`,
    shouldWrapUpNow
      ? `Coverage threshold is met. Stop asking new exploratory questions, briefly wrap up the call, give a warm closing, and then finish the call using the end marker rule above.`
      : "Coverage threshold is not met yet. Keep the call going and prioritize naturally asking about these uncovered topics (one at a time):",
    shouldWrapUpNow ? "(no more exploratory questions needed)" : topUncovered,
    "",
    `Current user turn count: ${userTurnCount}`,
    `Resume file: ${profile?.resume_file_name ?? "(none)"}`,
    `Resume links: ${linkText || "(none)"}`,
    structuredProfileText || "[Structured Talent Profile]\n(none)",
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

    const instructions = await buildRealtimeInstructions(
      user.id,
      conversationId
    );
    const tools = getRealtimeTools("voice");
    const toolVoicePreambles = getTalentToolVoicePreambles("voice");

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
          modalities: useElevenLabsTts ? ["text"] : ["text", "audio"],
          ...(useElevenLabsTts ? {} : { voice: "coral" }),
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          instructions,
          ...(tools.length > 0
            ? {
                tools,
                tool_choice: "auto" as const,
              }
            : {}),
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
