import { NextRequest, NextResponse } from "next/server";
import { geminiChatStream, xaiClient } from "@/lib/llm/llm";
import { ChatScope } from "@/hooks/chat/useChatSession";
import { buildLongDoc } from "@/utils/textprocess";
import { logger } from "@/utils/logger";
import { CANDID_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./chat_prompt";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await req.json()) as {
    model?: string;
    messages?: ChatMessage[];
    scope?: ChatScope;
    doc?: any;
  };

  const model = body.model ?? "grok-4-fast-reasoning";

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  let systemPrompt = "";
  if (body.scope?.type === "candid") {
    const information = buildLongDoc(body.doc);
    systemPrompt =
      CANDID_SYSTEM_PROMPT +
      `### Candidate Information
${information}
`;
  }
  if (body.scope?.type === "query") {
    systemPrompt = SYSTEM_PROMPT;
  }

  if (model === "grok-4-fast-reasoning") {
    const stream = await xaiClient.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
      temperature: 0.7,
      stream: true,
    });

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  if (model === "gemini-3-flash-preview") {
    try {
      const responseStream = await geminiChatStream({ model: "gemini-3-flash-preview", systemPrompt, messages, temperature: 0.7 });
      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (error) {
      const stream = await xaiClient.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        temperature: 0.7,
        stream: true,
      });

      const encoder = new TextEncoder();
      const responseStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const delta = chunk.choices?.[0]?.delta?.content ?? "";
              if (delta) controller.enqueue(encoder.encode(delta));
            }
          } catch (error) {
            controller.error(error);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
  }
}
