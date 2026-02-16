import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { geminiChatStream, xaiClient } from "@/lib/llm/llm";
import { ChatScope } from "@/hooks/chat/useChatSession";
import { buildLongDoc } from "@/utils/textprocess";
import { logger } from "@/utils/logger";
import {
  CANDID_SYSTEM_PROMPT,
  DEEP_AUTOMATION_PROMPT,
  SYSTEM_PROMPT,
} from "./chat_prompt";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AttachmentPayload = {
  name: string;
  text: string;
  size?: number;
  mime?: string;
  truncated?: boolean;
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_MEMORY_CHARS = 2000;
const MAX_ATTACHMENT_CHARS = 12000;
const MAX_TEAM_CONTEXT_CHARS = 1200;
const MAX_TOOL_TEXT_CHARS = 12000;
const MAX_TOOL_LOOPS = 3;
const MAX_TOTAL_TOOL_CALLS = 4;
const UI_START = "<<UI>>";
const UI_END = "<<END_UI>>";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function clampText(s: string, maxChars: number) {
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `\n...[truncated ${s.length - maxChars} chars]`;
}

function emitUiBlock(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  block: any
) {
  const payload = `${UI_START}\n${JSON.stringify(block)}\n${UI_END}`;
  controller.enqueue(encoder.encode(payload));
}

function makeInternalUrl(req: NextRequest, path: string) {
  const base = new URL(req.url);
  base.pathname = path;
  base.search = "";
  base.hash = "";
  return base.toString();
}

async function callWebsiteScraping(req: NextRequest, args: any) {
  const url = makeInternalUrl(req, "/api/tool/scrape");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: String(args?.url ?? ""),
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`website_scraping failed: ${res.status} ${txt}`);
  }

  const json = (await res.json()) as any;
  return {
    url: String(json?.url ?? args?.url ?? ""),
    title: json?.title ?? "",
    markdown: json?.markdown ?? "",
    excerpt: json?.excerpt ?? "",
  };
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

function buildAutomationSystemPrompt(
  basePrompt: string,
  memoryContent: string
) {
  const normalized = memoryContent.trim().slice(0, MAX_MEMORY_CHARS);
  const today = new Date().toISOString().slice(0, 10);

  return `${basePrompt}

### Today
${today}

### Memory about the user/team; not role-specific
${normalized.length > 0 ? normalized : "(none)"}

---

Instructions:
- Use Team Memory only as background about the team/user, not as role requirements.
- Do not invent or assume memory details beyond what is written above.
- Team Memory may contain dated entries such as "### YYYY-MM-DD".
- If a memory point is old or likely to have changed (team size, product direction, urgency, compensation, hiring priorities), do not assume it is still valid.
- In that case, either:
  - treat it as unknown for now, or
  - ask a short confirmation question like:
    "이전에 YYYY-MM-DD 기준으로 ~라고 말씀해주셨는데, 지금도 동일한가요?"
- If user gives newer info in this chat, prioritize the latest user message over old memory.
- If team memory is empty or insufficient, then in the first assistant reply after the user's first message:
  - Start with "알겠습니다."
  - Say you need team information for better recommendations.
  - Ask first about: team culture, what the team is building, team size, and preferred talent profile.
  - Ask these before any other questions.
  - 직접 적으로 메모리라는 단어를 쓰지 말고, 좋은 추천을 위해서 팀의 정보가 더 있으면 좋다는걸 알려주는게 나아.
  - 회사/팀에 대한 설명을 대신해주는 링크가 있다면 그걸 알려줘도 좋다고 말해줘.
`;
}

const tools = [
  {
    type: "function",
    function: {
      name: "website_scraping",
      description:
        "Fetch and read the content of a specific URL. Use when a user provides a link or asks about a specific page.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to scrape." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
] as const;

async function streamWithTools(params: {
  req: NextRequest;
  model: string;
  baseMessages: ChatMessage[];
  systemPrompt: string;
  temperature: number;
}) {
  const { req, model, baseMessages, systemPrompt, temperature } = params;
  const encoder = new TextEncoder();
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...baseMessages,
  ];
  let totalToolCallsUsed = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
          const llmStream = await xaiClient.chat.completions.create({
            model,
            messages,
            temperature,
            stream: true,
            tools: tools as any,
            tool_choice: "auto",
          });

          const toolCallsByIndex = new Map<
            number,
            { id?: string; name?: string; argumentsStr: string }
          >();
          let sawAnyToolCall = false;

          for await (const chunk of llmStream as any) {
            const choice = chunk?.choices?.[0];
            const delta = choice?.delta ?? {};

            const text = delta?.content ?? "";
            if (text) controller.enqueue(encoder.encode(text));

            const tcs = delta?.tool_calls;
            if (Array.isArray(tcs) && tcs.length) {
              sawAnyToolCall = true;
              for (const tc of tcs) {
                const idx = typeof tc.index === "number" ? tc.index : 0;
                const existing = toolCallsByIndex.get(idx) ?? {
                  id: tc.id,
                  name: tc.function?.name,
                  argumentsStr: "",
                };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                const argDelta = tc.function?.arguments ?? "";
                if (argDelta) existing.argumentsStr += argDelta;
                toolCallsByIndex.set(idx, existing);
              }
            }
          }

          if (!sawAnyToolCall || toolCallsByIndex.size === 0) break;

          const orderedToolCalls = Array.from(toolCallsByIndex.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([_, v]) => ({
              id: v.id ?? `toolcall_${crypto.randomUUID()}`,
              name: v.name ?? "",
              argumentsStr: v.argumentsStr ?? "",
            }));

          messages.push({
            role: "assistant",
            content: "",
            tool_calls: orderedToolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.argumentsStr },
            })),
          });

          const remaining = MAX_TOTAL_TOOL_CALLS - totalToolCallsUsed;
          const toExecute =
            remaining > 0 ? orderedToolCalls.slice(0, remaining) : [];
          const skipped = orderedToolCalls.slice(toExecute.length);

          for (const tc of toExecute) {
            totalToolCallsUsed++;

            const toolCallId = tc.id;
            const toolName = tc.name;

            emitUiBlock(controller, encoder, {
              type: "tool_status",
              id: toolCallId,
              name: toolName,
              state: "running",
            });

            let parsedArgs: any = {};
            try {
              parsedArgs = tc.argumentsStr ? JSON.parse(tc.argumentsStr) : {};
            } catch {
              parsedArgs = { _raw: tc.argumentsStr ?? "" };
            }

            let toolPayload: any;
            try {
              if (toolName === "website_scraping") {
                toolPayload = await callWebsiteScraping(req, parsedArgs);
              } else {
                toolPayload = { error: `Unknown tool: ${toolName}` };
              }
            } catch (e: any) {
              toolPayload = { error: String(e?.message ?? e) };
            }

            emitUiBlock(controller, encoder, {
              type: "tool_status",
              id: toolCallId,
              name: toolName,
              state: toolPayload?.error ? "error" : "done",
              ...(toolPayload?.error
                ? { message: String(toolPayload.error).slice(0, 140) }
                : {}),
            });

            if (toolName === "website_scraping" && toolPayload?.markdown) {
              const trimmed = clampText(
                String(toolPayload.markdown),
                MAX_TOOL_TEXT_CHARS
              );
              const excerpt =
                toolPayload.excerpt ||
                trimmed.replace(/\s+/g, " ").slice(0, 600);
              emitUiBlock(controller, encoder, {
                type: "tool_result",
                name: "website_scraping",
                title: toolPayload.title ?? "",
                url: toolPayload.url ?? "",
                excerpt,
                truncated: trimmed.length < String(toolPayload.markdown).length,
              });
              toolPayload.markdown = trimmed;
            }

            messages.push({
              role: "tool",
              tool_call_id: toolCallId,
              name: toolName,
              content: JSON.stringify(toolPayload),
            });
          }

          if (skipped.length) {
            for (const tc of skipped) {
              messages.push({
                role: "tool",
                tool_call_id: tc.id,
                name: tc.name,
                content: JSON.stringify({
                  error: "Tool call budget exceeded",
                  max_total_tool_calls: MAX_TOTAL_TOOL_CALLS,
                }),
              });
            }
          }

          if (totalToolCallsUsed >= MAX_TOTAL_TOOL_CALLS) break;
        }
      } catch (err) {
        logger.log("streamWithTools error:", err);
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
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
    companyDescription?: string;
    teamLocation?: string;
    attachments?: AttachmentPayload[];
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

  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (attachments.length > 0) {
    const attachmentText = attachments
      .map((a, idx) => {
        const safeText = clampText(String(a.text ?? ""), MAX_ATTACHMENT_CHARS);
        return `### Attachment ${idx + 1}: ${a.name ?? "파일"}\n${
          a.mime ? `Type: ${a.mime}\n` : ""
        }${a.size ? `Size: ${a.size} bytes\n` : ""}\n${safeText}`;
      })
      .join("\n\n");

    systemPrompt += `\n\n### Attachments (User-provided)\n${attachmentText}\n\nInstructions:\n- Use the attachment content to answer the user's request.\n- If the attachment is insufficient, ask a concise follow-up question.\n`;
  }

  if (
    body.scope?.type === "query" &&
    body.memoryMode === "automation" &&
    body.userId
  ) {
    const description = clampText(
      String(body.companyDescription ?? "").trim(),
      MAX_TEAM_CONTEXT_CHARS
    );
    const location = clampText(
      String(body.teamLocation ?? "").trim(),
      200
    );
    if (description.length > 0 || location.length > 0) {
      const profileLines = [
        description.length > 0
          ? `- Company/Team description: ${description}`
          : "",
        location.length > 0 ? `- Location: ${location}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      systemPrompt += `\n\n### Team Profile (from Account settings)\n${profileLines}\n\nInstructions:\n- Use this as stable background context for recommendations.\n- If this conflicts with the latest user message, prioritize the latest user message.\n`;
    }

    try {
      const memoryRow = await fetchLatestMemory(body.userId);
      const memoryContent = (memoryRow?.content ?? "").trim();
      systemPrompt = buildAutomationSystemPrompt(systemPrompt, memoryContent);
    } catch (error) {
      logger.log("Failed to load team memory:", error);
      systemPrompt = buildAutomationSystemPrompt(systemPrompt, "");
    }
  }

  const allowTools =
    body.scope?.type === "query" && body.memoryMode === "automation";

  if (model === "grok-4-fast-reasoning" && allowTools) {
    const toolPrompt = `${systemPrompt}

### Tool Use
- You may call website_scraping when the user provides a URL or asks about a specific page.
- After using the tool, incorporate the key points from the content into your response.
`;

    const responseStream = await streamWithTools({
      req,
      model,
      baseMessages: messages,
      systemPrompt: toolPrompt,
      temperature: 0.7,
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
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
      const responseStream = await geminiChatStream({
        model: "gemini-3-flash-preview",
        systemPrompt,
        messages,
        temperature: 0.7,
      });
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
