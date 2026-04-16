import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { client } from "@/lib/llm/llm";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

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

function isBriefConversation(stats: TranscriptStats, durationSeconds: number): boolean {
  if (stats.userTurns <= 0) return true;
  if (stats.userTurns === 1) return true;
  if (stats.userChars < 80) return true;
  if (durationSeconds > 0 && durationSeconds < 50) return true;
  return false;
}

function buildFallbackFollowUp(isBrief: boolean): string {
  if (isBrief) {
    return "오늘은 짧게 이야기 나눴네요. 다음에 편하실 때 조금만 더 들려주시면 그에 맞춰 더 잘 도와드릴게요.";
  }

  return "좋은 이야기 들려주셔서 감사합니다. 말씀해주신 내용을 바탕으로 만족하실 만한 기회를 잘 골라서 가져와볼게요.";
}

function normalizeFollowUpMessage(content: string): string {
  return content
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFollowUpPrompt(args: {
  transcript: TranscriptEntry[];
  durationLabel: string | null;
  isBrief: boolean;
}): string {
  const { transcript, durationLabel, isBrief } = args;
  const lines = transcript
    .map((entry) => `${entry.role === "user" ? "User" : "Harper"}: ${entry.text}`)
    .join("\n");

  return `당신은 Harper, AI 커리어 어드바이저입니다. 방금 음성 통화가 종료되었습니다.

통화 길이 평가는 "${isBrief ? "짧은 대화" : "충분히 진행된 대화"}"입니다.
${durationLabel ? `통화 시간은 ${durationLabel}입니다.` : ""}

사용자에게 보낼 마지막 한마디만 자연스럽게 작성하세요.

규칙:
- 한국어 존댓말로 작성
- 1~2문장, 최대 120자 정도
- 제목, 불릿, 번호, 요약 섹션 금지
- "통화 요약", "정리하면" 같은 표현 금지
- 너무 짧은 대화였다면: 오늘은 짧게 들었으니 다음에 더 이야기해 달라고 부드럽게 안내
- 충분한 대화였다면: 좋은 정보를 알려줘서 고맙고, 만족하실 만한 기회를 가져오겠다고 자연스럽게 말하기
- 과한 확신, 과장, 딱딱한 상담 문구 금지
- 응답은 메시지 본문 텍스트만 출력

아래는 방금 통화 transcript입니다:

${lines || "(대화 내용이 거의 없었음)"}`;
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

    const safeDurationSeconds = Math.max(0, Math.floor(durationSeconds ?? 0));
    const durationLabel =
      safeDurationSeconds > 0 ? formatDuration(safeDurationSeconds) : null;
    const transcriptStats = summarizeTranscript(transcript);
    const briefConversation = isBriefConversation(
      transcriptStats,
      safeDurationSeconds
    );

    let followUpText = buildFallbackFollowUp(briefConversation);

    try {
      const prompt = buildFollowUpPrompt({
        transcript,
        durationLabel,
        isBrief: briefConversation,
      });

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });

      const content = response.choices[0]?.message?.content ?? "";
      const normalized = normalizeFollowUpMessage(content);
      if (normalized) {
        followUpText = normalized;
      }
    } catch (error) {
      console.error("[call-wrapup] Failed to generate follow-up", { error });
    }

    const supabase = getTalentSupabaseAdmin();
    const now = new Date().toISOString();

    const followUpRow = {
      conversation_id: conversationId,
      user_id: user.id,
      role: "assistant",
      content: followUpText,
      message_type: "chat",
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
    }

    return NextResponse.json({
      followUpMessage: savedFollowUp ?? {
        id: `followup-${Date.now()}`,
        role: "assistant",
        content: followUpText,
        messageType: "chat",
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
