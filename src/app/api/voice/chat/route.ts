import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import type { TalentChatMessage } from "@/lib/talentOnboarding/llm";
import { buildVoiceSystemPrompt } from "@/lib/voice/systemPrompt";
import {
  fetchTalentUserProfile,
  fetchTalentStructuredProfile,
  buildTalentProfileContext,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { logger } from "@/utils/logger";

export const runtime = "nodejs";

type Body = {
  conversationId: string;
  userText: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  existingInsightsContext?: string;
  turnCount?: number;
  durationSeconds?: number;
};

const WRAP_UP_TURN_THRESHOLD = 8;
const WRAP_UP_DURATION_THRESHOLD = 300; // 5 minutes

const CLOSING_PATTERNS = [
  "연락드릴게요",
  "연락드리겠습니다",
  "마무리",
  "종료",
  "여기까지",
  "감사합니다. 말씀해주신",
  "좋은 기회 찾아서",
  "기회를 찾아보고",
  "대화는 여기서",
];

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const { conversationId, userText, conversationHistory, existingInsightsContext, turnCount, durationSeconds } = body;

    const shouldWrapUp =
      (turnCount != null && turnCount >= WRAP_UP_TURN_THRESHOLD) ||
      (durationSeconds != null && durationSeconds >= WRAP_UP_DURATION_THRESHOLD);

    if (!conversationId || !userText?.trim()) {
      return NextResponse.json(
        { error: "conversationId and userText are required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const profile = await fetchTalentUserProfile({ admin, userId: user.id });
    const structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const structuredProfileText = buildTalentProfileContext({
      profile,
      structuredProfile,
      maxResumeChars: 3000,
    });

    const systemPrompt = buildVoiceSystemPrompt({
      existingInsightsContext,
      resumeFileName: profile?.resume_file_name ?? undefined,
      resumeLinks: profile?.resume_links ?? undefined,
      structuredProfileText,
    });

    const wrapUpInstruction = shouldWrapUp
      ? "\n\n[시스템 안내] 대화가 충분히 진행되었습니다. 이번 답변에서 자연스럽게 대화를 마무리해 주세요. 예: \"감사합니다. 말씀해주신 내용 기반으로 잘 맞는 기회 찾아서 연락드릴게요!\""
      : "";

    const messages: TalentChatMessage[] = [
      { role: "system", content: systemPrompt + wrapUpInstruction },
      ...conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userText },
    ];

    const assistantText = await runTalentAssistantCompletion({
      messages,
      temperature: 0.35,
    });

    const shouldEnd = CLOSING_PATTERNS.some((p) => assistantText.includes(p));

    logger.log("[VoiceChat] Response generated", {
      userId: user.id,
      conversationId,
      responseLength: assistantText.length,
      shouldEnd,
      turnCount,
    });

    return NextResponse.json({ assistantText, shouldEnd });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Voice chat failed";
    logger.log("[VoiceChat] Error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
