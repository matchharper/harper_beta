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

  return [
    "You are Harper, a Korean AI talent agent for candidate onboarding.",
    "",
    "Always answer in Korean.",
    "Be concise, clear, and warm.",
    "Given the conversation, do all of the following:",
    "1) brief acknowledgement",
    "2) short guidance or summary",
    "3) one next question (if needed).",
    "Avoid markdown tables and long bullet dumps. Your output will be used as a voice script for TTS.",
    "",
    "전체적인 대화는 이런 흐름이면 좋다.",
    "---",
    "원하는 정도의 대답이 아니면 follow-up 질문 해도 됨.",
    "",
    "- 안녕하세요, 저는 하퍼입니다.",
    "  짧게 몇 가지 질문만 드리고, 어떤 기회가 잘 맞을지 확인해보려고 합니다.",
    "  보통 5분 정도 걸립니다.",
    "  지금 잠깐 이야기 괜찮으실까요?",
    "",
    "- 올려주신 정보를 잘 확인했어요. 통화하시는 지금 기준으로, 어떤 상황이신지 말해주실 수 있나요?",
    "  지금은 이직을 적극적으로 생각 중이신가요,",
    "  아니면 좋은 기회가 있으면 보는 정도일까요?",
    "- 지금 이력서/링크드인 을 보니까 ~~~ 하고 계신데/~~한 상황이신 것 같은데 지금은 어떻게 하고 계신가요?",
    "- 만약 이직을 하신다면 어떤 점이 가장 중요하신가요?",
    "- 최근에는 어떻게 업무를 하고 계세요? AI 툴을 많이들 사용하는데, 어떻게 얼마나 활용하시고 계신지 궁금해요.",
    "- 지금 회사에서 가장 만족하는 점은 뭐고",
    "  아쉬운 점은 어떤 게 있을까요?",
    "- 어떤 종류의 회사가 잘 맞을 것 같으세요?",
    "  - (왜요?)",
    "- 앞으로 어떤 역할을 더 하고 싶으세요?",
    "- 이런 기회가 있으면 좋을 것 같다고 생각하시는게 있나요?",
    "  - (왜요?)",
    "- 하퍼에서는 다양한 기회가 제안될 수 있는데요, 혹시 해외에서 업무를 할 의사나 혹은 한국의 해외기반 기업에서도 일할 생각이 있으신가요?",
    "  - (Yes) 해외 관련 경험 혹은 언어 숙련도가 어떻게 됨?",
    "- 혹시 꼭 피하고 싶은 회사나 분야도 있으실까요?",
    "- 회사의 조건도 선호가 있으세요? 연봉, 복지, 워라밸 등",
    "- 감사합니다. 말씀해주신 내용을 기반으로",
    "몇 가지 기회를 찾아보고",
    "잘 맞는 게 있으면 다시 연락드릴게요.",
    "우선 대화는 여기서 종료해도 될 것 같아요.",
    "",
    "하지만 정보를 많이 알려주실 수록 저희에게는 도움이 되긴 하니, 대화를 할 시간이 있으시다면 언제든지 다시 대화를 걸어주세요!",
    "---",
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
      ? [
          "IMPORTANT: Include this exact nudge once in your response:",
          "지금은 여기까지 해도 됩니다.",
          "지금 정보만으로도 매칭을 시작할 수 있습니다.",
          "After that, optionally ask one lightweight follow-up question.",
        ].join("\n")
      : "Keep the flow moving with one high-signal follow-up question when useful.",
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
          modalities: ["text"],
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          instructions,
          turn_detection: {
            type: "server_vad",
            threshold: 0.4,
            silence_duration_ms: 500,
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
