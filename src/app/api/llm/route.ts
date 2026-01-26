import { geminiInference } from "@/lib/llm/llm";
import { ThinkingLevel } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { systemPrompt, userPrompt } = await req.json();

        const response = await geminiInference("gemini-3-flash-preview", systemPrompt, userPrompt, 0.2, ThinkingLevel.THINKING_LEVEL_UNSPECIFIED);
        console.log("response", response);
        const parts = (response as any).candidates?.[0].content.parts || [];

        // 생각(Thought) 부분과 실제 답변(Text) 부분 분리
        const thoughts = parts.filter((p: any) => p.thought).map((p: any) => p.text).join("\n");
        const answer = parts.filter((p: any) => !p.thought).map((p: any) => p.text).join("\n");

        return NextResponse.json({
            thoughts: thoughts || "No thoughts generated",
            answer: answer,
        });

    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}