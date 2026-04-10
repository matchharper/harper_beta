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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${s}초`;
}

function buildWrapUpPrompt(
  transcript: TranscriptEntry[],
  duration: string
): string {
  const lines = transcript
    .map((e) => `${e.role === "user" ? "User" : "Harper"}: ${e.text}`)
    .join("\n");

  return `당신은 Harper, AI 커리어 어드바이저입니다. 방금 음성 통화가 종료되었습니다 (통화 시간: ${duration}).

아래는 통화 내용입니다:

${lines}

다음 필드를 포함하는 구조화된 JSON 통화 요약을 생성하세요:
- "whatWeCovered": 논의한 내용을 요약하는 2-4개의 항목 (한글로 작성)
- "keyLearnings": 사용자에 대한 핵심 파악 사항 2-4개 (경력 목표, 선호도, 기술 등) (한글로 작성)
- "nextSteps": 구체적인 다음 단계 2-3개 (한글로 작성)

또한 통화를 인정하고 다음 단계로 안내하는 자연스러운 후속 메시지(1-2 문단)를 한글로 생성하세요.

반드시 아래 형식의 유효한 JSON으로만 응답하세요:
{
  "wrapUp": { "whatWeCovered": [...], "keyLearnings": [...], "nextSteps": [...] },
  "followUpMessage": "..."
}`;
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

    const duration = formatDuration(durationSeconds ?? 0);

    // Generate wrap-up via LLM
    const prompt = buildWrapUpPrompt(transcript, duration);
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: {
      wrapUp?: {
        whatWeCovered?: string[];
        keyLearnings?: string[];
        nextSteps?: string[];
      };
      followUpMessage?: string;
    };

    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[call-wrapup] Failed to parse LLM response", { content });
      return NextResponse.json(
        { error: "Failed to generate wrap-up" },
        { status: 500 }
      );
    }

    const wrapUpData = {
      duration,
      whatWeCovered: parsed.wrapUp?.whatWeCovered ?? [],
      keyLearnings: parsed.wrapUp?.keyLearnings ?? [],
      nextSteps: parsed.wrapUp?.nextSteps ?? [],
    };

    const followUpText =
      parsed.followUpMessage ??
      "통화가 종료되었습니다. 채팅으로 이어서 도와드리겠습니다.";

    // Save wrap-up message to DB
    const supabase = getTalentSupabaseAdmin();
    const now = new Date().toISOString();

    const wrapUpRow = {
      conversation_id: conversationId,
      user_id: user.id,
      role: "assistant",
      content: JSON.stringify(wrapUpData),
      message_type: "call_wrapup",
      created_at: now,
    };

    const followUpRow = {
      conversation_id: conversationId,
      user_id: user.id,
      role: "assistant",
      content: followUpText,
      message_type: "chat",
      created_at: new Date(Date.now() + 1000).toISOString(),
    };

    const { data: savedWrapUp, error: wrapUpError } = await supabase
      .from("talent_messages")
      .insert(wrapUpRow)
      .select("id, role, content, message_type, created_at")
      .single();

    if (wrapUpError) {
      console.error("[call-wrapup] Failed to save wrap-up message", {
        error: wrapUpError,
      });
    }

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
      wrapUpMessage: savedWrapUp ?? {
        id: `wrapup-${Date.now()}`,
        role: "assistant",
        content: JSON.stringify(wrapUpData),
        messageType: "call_wrapup",
        createdAt: now,
      },
      followUpMessage: savedFollowUp ?? {
        id: `followup-${Date.now()}`,
        role: "assistant",
        content: followUpText,
        messageType: "chat",
        createdAt: new Date(Date.now() + 1000).toISOString(),
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
