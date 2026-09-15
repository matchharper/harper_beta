import { NextRequest, NextResponse } from "next/server";
import { ChatScope } from "@/hooks/chat/useChatSession";
import { buildLongDoc } from "@/utils/textprocess";
import { logger } from "@/utils/logger";
import { CANDID_SYSTEM_PROMPT, MAX_MESSEGE_LENGTH } from "../chat_prompt";
import { createLunaChatCompletion } from "../streamProviders";

type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  // Tool message fields (OpenAI-compatible)
  tool_call_id?: string;
  name?: string;
};

type WebSearchResult = {
  title?: string;
  url: string;
  snippet?: string;
  published_at?: string;
};

type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
};

type ScrapeResponse = {
  url: string;
  title?: string;
  markdown?: string;
};

const MAX_TOOL_LOOPS = 3;
const MAX_TOTAL_TOOL_CALLS = 5;
const MAX_TOOL_TEXT_CHARS = 18_000; // hard cap to avoid prompt blow-ups
const UI_START = "<<UI>>";
const UI_END = "<<END_UI>>";

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

async function callWebSearch(
  req: NextRequest,
  args: any
): Promise<WebSearchResponse> {
  logger.log("\n 웹 검색 호출 in candid route", args);
  const url = makeInternalUrl(req, "/api/tool/web_search");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: String(args?.query ?? ""),
      // Optional knobs (if your endpoint supports them)
      recencyDays: args?.recencyDays ?? 30,
      maxResults: args?.maxResults ?? 5,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`web_search failed: ${res.status} ${txt}`);
  }

  const json = (await res.json()) as any;

  // Normalize to {query, results:[{url,title,snippet}]}
  const results: WebSearchResult[] = Array.isArray(json?.results)
    ? json.results
    : Array.isArray(json)
      ? json
      : [];

  return {
    query: String(json?.query ?? args?.query ?? ""),
    results: json,
  };
}

async function callWebsiteScraping(
  req: NextRequest,
  args: any
): Promise<ScrapeResponse> {
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
  logger.log("\n callWebsiteScraping in candid route 결과", json);
  return {
    url: String(json?.url ?? args?.url ?? ""),
    title: json?.title ?? "",
    markdown: json?.markdown ?? "",
  };
}

/**
 * Tools definition (OpenAI-compatible function calling).
 */
const tools = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for up-to-date information. Use when the answer needs verification or current facts. Return key results with URLs.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          recencyDays: {
            type: "integer",
            description: "Prefer results within N days (e.g., 30).",
            default: 30,
          },
          maxResults: {
            type: "integer",
            description: "Max number of results to return (e.g., 5).",
            default: 5,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "website_scraping",
      description:
        "Fetch and extract main text content from a given URL for grounding. Use only when necessary (e.g., reading a specific page).",
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

function buildToolAugmentedSystemPrompt(
  candidateDoc: any,
  systemPromptOverride?: string
) {
  const information = buildLongDoc(candidateDoc);
  const basePrompt =
    typeof systemPromptOverride === "string" &&
    systemPromptOverride.trim().length > 0
      ? systemPromptOverride
      : CANDID_SYSTEM_PROMPT;

  // IMPORTANT: user asked "no markdown"; allow <strong>/<br/>
  // Also: make tool-grounding behavior explicit.
  return (
    basePrompt +
    `
### Candidate Information
${information}

### Tool Use Policy (IMPORTANT)
- You MAY call tools when needed to answer factual / up-to-date / web-based questions.
- Tools available: web_search, website_scraping.
- When you use tool results, you MUST cite sources at the end.
  Format example (no markdown, space between a tags):
  <a href="URL">TITLE</a> <a href="URL">TITLE</a>
- Do NOT fabricate URLs or citations.
- Do NOT try to scrape linkedin and scholar pages.
- Keep the final answer as plain string. You may use <strong> and <br/> only.
`
  );
}

async function streamWithTools(params: {
  req: NextRequest;
  baseMessages: ChatMessage[];
  systemPrompt: string;
  temperature: number;
}) {
  const { req, baseMessages, systemPrompt, temperature } = params;
  const encoder = new TextEncoder();
  const recent = baseMessages.slice(-MAX_MESSEGE_LENGTH);
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...recent,
  ];

  let totalToolCallsUsed = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
          const { response } = await createLunaChatCompletion({
            messages,
            onTextDelta: (delta) => {
              if (delta) controller.enqueue(encoder.encode(delta));
            },
            temperature,
            tools: tools as any,
            tool_choice: "auto",
          });
          const responseToolCalls = response?.choices?.[0]?.message?.tool_calls;
          if (
            !Array.isArray(responseToolCalls) ||
            responseToolCalls.length === 0
          ) {
            break;
          }

          // ✅ id를 여기서 확정(assistant/tool 동일 id 보장)
          const orderedToolCalls = responseToolCalls.map((toolCall: any) => ({
            argumentsStr: String(toolCall?.function?.arguments ?? ""),
            id: String(toolCall?.id ?? `toolcall_${crypto.randomUUID()}`),
            name: String(toolCall?.function?.name ?? ""),
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

          // ✅ 글로벌 예산 고려해서 이번에 실행할 tool call만 자르기
          const remaining = MAX_TOTAL_TOOL_CALLS - totalToolCallsUsed;
          const toExecute =
            remaining > 0 ? orderedToolCalls.slice(0, remaining) : [];
          const skipped = orderedToolCalls.slice(toExecute.length);

          // 1) 실행
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
              if (toolName === "web_search")
                toolPayload = await callWebSearch(req, parsedArgs);
              else if (toolName === "website_scraping")
                toolPayload = await callWebsiteScraping(req, parsedArgs);
              else toolPayload = { error: `Unknown tool: ${toolName}` };
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
              toolPayload.markdown = clampText(
                String(toolPayload.markdown),
                MAX_TOOL_TEXT_CHARS
              );
            }

            messages.push({
              role: "tool",
              tool_call_id: toolCallId,
              name: toolName,
              content: JSON.stringify(toolPayload),
            });
          }

          // 2) 예산 초과로 스킵된 툴콜들 처리(모델이 계속 요구하지 않게 “응답을 줬다”고 남김)
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

            // 여기서 바로 break 해도 되고, 다음 루프로 가서 모델이 “이제 도구 못 씀” 상태에서 답을 내게 해도 됨.
            // 보통은 다음 루프로 한 번 더 돌리는 게 마무리 답이 잘 나옴.
          }

          // ✅ 글로벌 예산이 0이면, 다음 루프에서 tools를 꺼버리는 것도 강력 추천(모델이 더 요청 못하게)
          if (totalToolCallsUsed >= MAX_TOTAL_TOOL_CALLS) {
            // 다음 loop에서 tools 제거하는 전략을 쓰려면,
            // loop 상단 create() 호출 부분을 조건부로 바꿔야 함(아래 “옵션” 참고).
          }
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
  };

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  const systemPrompt = buildToolAugmentedSystemPrompt(
    body.doc,
    body.systemPromptOverride
  );

  const responseStream = await streamWithTools({
    req,
    baseMessages: messages.map((m) => ({ role: m.role, content: m.content })),
    systemPrompt,
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
