import { callGreeting, makeQuestion } from "@/lib/llm/llm";
import { NextResponse } from "next/server";

type CallRequestBody = {
  mode?: "greeting" | "followup";
  conversationHistory?: string;
  userInfo?: string;
  resumeText?: string;
};

const FOLLOW_UP_FALLBACKS = [
  "좋아요. 최근에 가장 몰입해서 했던 일이나 프로젝트를 짧게 말씀해 주세요.",
  "좋습니다. 다음으로, 어떤 역할이나 회사 환경을 가장 선호하는지도 알려주세요.",
  "알겠습니다. 지금 시점에서 가장 중요하게 보는 조건이 무엇인지도 말씀해 주세요.",
  "좋아요. 이어서 더 강조하고 싶은 강점이나 원하는 조건이 있다면 자유롭게 말씀해 주세요.",
];

const getFallbackFollowUp = (conversationHistory: string) => {
  const userTurnCount = conversationHistory
    .split("\n")
    .filter((line) => line.startsWith("User:")).length;

  return FOLLOW_UP_FALLBACKS[
    Math.min(userTurnCount, FOLLOW_UP_FALLBACKS.length - 1)
  ];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CallRequestBody;
    const mode = body.mode ?? "followup";
    const userInfo = body.userInfo ?? "";
    const resumeText = body.resumeText ?? "";

    if (mode === "greeting") {
      const text = await callGreeting(userInfo, resumeText);
      return NextResponse.json({ text });
    }

    const conversationHistory = body.conversationHistory?.trim() ?? "";
    if (!conversationHistory) {
      return NextResponse.json(
        { error: "conversationHistory is required" },
        { status: 400 }
      );
    }

    try {
      const text = await makeQuestion(conversationHistory, userInfo, resumeText);
      return NextResponse.json({ text });
    } catch (error) {
      console.error("[/api/call] makeQuestion failed, using fallback", error);
      return NextResponse.json({
        text: getFallbackFollowUp(conversationHistory),
      });
    }
  } catch (error) {
    console.error("[/api/call] request failed", error);

    return NextResponse.json(
      { error: "Failed to generate call response" },
      { status: 500 }
    );
  }
}
