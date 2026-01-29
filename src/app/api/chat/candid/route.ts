import { NextRequest, NextResponse } from "next/server";
import { xaiClient } from "@/lib/llm/llm";
import { ChatScope } from "@/hooks/chat/useChatSession";
import { buildLongDoc } from "@/utils/textprocess";
import { logger } from "@/utils/logger";
import { CANDID_SYSTEM_PROMPT } from "../chat_prompt";

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

const DEFAULT_MODEL = "grok-4-1-fast-reasoning";
const MAX_TOOL_LOOPS = 3;
const MAX_TOOL_TEXT_CHARS = 18_000; // hard cap to avoid prompt blow-ups

function clampText(s: string, maxChars: number) {
    if (!s) return "";
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + `\n...[truncated ${s.length - maxChars} chars]`;
}

/**
 * Build absolute URL for internal tool endpoints.
 * Works both locally and on Vercel.
 */
function makeInternalUrl(req: NextRequest, path: string) {
    const base = new URL(req.url);
    base.pathname = path;
    base.search = "";
    base.hash = "";
    return base.toString();
}

/**
 * Calls your existing web_search API.
 * Adjust request/response shape here to match your implementation.
 */
async function callWebSearch(req: NextRequest, args: any): Promise<WebSearchResponse> {
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
    const results: WebSearchResult[] =
        Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : [];

    return {
        query: String(json?.query ?? args?.query ?? ""),
        results: json,
    };
}

/**
 * Calls your existing scraping API.
 * Adjust request/response shape here to match your implementation.
 */
async function callWebsiteScraping(req: NextRequest, args: any): Promise<ScrapeResponse> {
    logger.log("\n 사이트 스크래핑 호출 in candid route", args);
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
 * Tools definition (OpenAI-style). Grok/xAI generally supports this format.
 * If your client uses a slightly different key (functions vs tools), tweak here.
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

function buildToolAugmentedSystemPrompt(candidateDoc: any) {
    const information = buildLongDoc(candidateDoc);

    // IMPORTANT: user asked "no markdown"; allow <strong>/<br/>
    // Also: make tool-grounding behavior explicit.
    return (
        CANDID_SYSTEM_PROMPT +
        `

### Candidate Information
${information}

### Tool Use Policy (IMPORTANT)
- You MAY call tools when needed to answer factual / up-to-date / web-based questions.
- Tools available: web_search, website_scraping.
- When you use tool results, you MUST cite sources by including a Sources section at the end.
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
    model: string;
    baseMessages: ChatMessage[];
    systemPrompt: string;
    temperature: number;
}) {
    const { req, model, baseMessages, systemPrompt, temperature } = params;

    const encoder = new TextEncoder();

    // We keep a mutable messages array to append tool results across loops.
    const messages: any[] = [{ role: "system", content: systemPrompt }, ...baseMessages];

    // This stream is what we return to the browser.
    return new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
                    // Start a model stream for this loop.
                    const llmStream = await xaiClient.chat.completions.create({
                        model,
                        messages,
                        temperature,
                        stream: true,
                        tools: tools as any,
                        tool_choice: "auto",
                    });

                    // Accumulate tool calls (streaming deltas deliver them gradually).
                    // OpenAI-style structure: delta.tool_calls: [{id, index, function:{name, arguments}}]
                    const toolCallsByIndex = new Map<
                        number,
                        { id?: string; name?: string; argumentsStr: string }
                    >();

                    let sawAnyToolCall = false;

                    for await (const chunk of llmStream as any) {
                        const choice = chunk?.choices?.[0];
                        const delta = choice?.delta ?? {};

                        // 1) Normal assistant text → stream to client
                        const text = delta?.content ?? "";
                        if (text) controller.enqueue(encoder.encode(text));

                        // 2) Tool calls → intercept (do NOT stream to client)
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

                    // If no tool call happened, we're done.
                    if (!sawAnyToolCall || toolCallsByIndex.size === 0) break;

                    // Convert tool calls into assistant tool_call message + tool results.
                    const orderedToolCalls = [...toolCallsByIndex.entries()]
                        .sort((a, b) => a[0] - b[0])
                        .map(([_, v]) => v);

                    // Append the assistant "tool_calls" message (so the model has a record of what it asked).
                    messages.push({
                        role: "assistant",
                        content: "",
                        tool_calls: orderedToolCalls.map((tc) => ({
                            id: tc.id ?? `toolcall_${Math.random().toString(16).slice(2)}`,
                            type: "function",
                            function: { name: tc.name, arguments: tc.argumentsStr },
                        })),
                    });

                    // Execute each tool call and append a corresponding tool message.
                    for (const tc of orderedToolCalls) {
                        const toolCallId = tc.id ?? `toolcall_${Math.random().toString(16).slice(2)}`;
                        const toolName = tc.name ?? "";

                        let parsedArgs: any = {};
                        try {
                            parsedArgs = tc.argumentsStr ? JSON.parse(tc.argumentsStr) : {};
                        } catch (e) {
                            // If JSON parsing fails, feed back the raw arguments to the model.
                            parsedArgs = { _raw: tc.argumentsStr ?? "" };
                        }

                        let toolPayload: any;
                        try {
                            if (toolName === "web_search") {
                                toolPayload = await callWebSearch(req, parsedArgs);
                            } else if (toolName === "website_scraping") {
                                toolPayload = await callWebsiteScraping(req, parsedArgs);
                            } else {
                                toolPayload = { error: `Unknown tool: ${toolName}` };
                            }
                        } catch (e: any) {
                            toolPayload = { error: String(e?.message ?? e) };
                        }

                        // Clamp large contents before feeding to the model.
                        if (toolName === "website_scraping" && toolPayload?.markdown) {
                            toolPayload.markdown = clampText(String(toolPayload.markdown), MAX_TOOL_TEXT_CHARS);
                        }

                        logger.log("\n tool calling의 결과를 저장합니다. ", toolName, "\npayload: ", JSON.stringify(toolPayload))

                        // Append tool output message.
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCallId,
                            name: toolName,
                            content: JSON.stringify(toolPayload),
                        });
                    }

                    // Continue next loop: model will see tool outputs and produce final answer (or more tool calls).
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
    };

    const model = DEFAULT_MODEL;
    // const model = body.model ?? DEFAULT_MODEL;

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) {
        return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    }
    logger.log("\n 첫 호출 messages", messages);

    const systemPrompt = buildToolAugmentedSystemPrompt(body.doc);

    const responseStream = await streamWithTools({
        req,
        model,
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
