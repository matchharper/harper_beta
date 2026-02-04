import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { geminiChatStream, xaiClient } from "@/lib/llm/llm";
import { ChatScope } from "@/hooks/chat/useChatSession";
import { buildLongDoc } from "@/utils/textprocess";
import { logger } from "@/utils/logger";
import { CANDID_SYSTEM_PROMPT, DEEP_AUTOMATION_PROMPT, SYSTEM_PROMPT } from "./chat_prompt";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_MEMORY_CHARS = 2000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchLatestMemory(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("memory")
    .select("id, content, created_at, last_updated_at")
    .eq("user_id", userId)
    .order("last_updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

function buildAutomationSystemPrompt(basePrompt: string, memoryContent: string) {
  const normalized = memoryContent.trim().slice(0, MAX_MEMORY_CHARS);

  return `${basePrompt}

### Memory about the about the user/team; not role-specific
${normalized.length > 0 ? normalized : "(none)"}

---

Instructions:
- Use Team Memory only as background about the team/user, not as role requirements.
- Do not invent or assume memory details beyond what is written above.
- If team memory is empty or insufficient, then in the first assistant reply after the user's first message:
  - Start with "알겠습니다."
  - Say you need team information for better recommendations.
  - Ask first about: team culture, what the team is building, team size, and preferred talent profile.
  - Ask these before any other questions.
  - 직접 적으로 메모리라는 단어를 쓰지 말고, 좋은 추천을 위해서 팀의 정보가 더 있으면 좋다는걸 알려주는게 나아.
`;
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
    systemPromptOverride?: string;
    userId?: string;
    memoryMode?: "automation";
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
    systemPrompt =
      typeof body.systemPromptOverride === "string" &&
        body.systemPromptOverride.trim().length > 0
        ? body.systemPromptOverride
        : SYSTEM_PROMPT;
  }

  if (
    body.scope?.type === "query" &&
    body.memoryMode === "automation" &&
    body.userId
  ) {
    try {
      const memoryRow = await fetchLatestMemory(body.userId);
      const memoryContent = (memoryRow?.content ?? "").trim();
      systemPrompt = buildAutomationSystemPrompt(systemPrompt, memoryContent);
    } catch (error) {
      logger.log("Failed to load team memory:", error);
      if (systemPrompt.trim() === DEEP_AUTOMATION_PROMPT.trim()) {
        systemPrompt = buildAutomationSystemPrompt(systemPrompt, "");
      }
    }
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
