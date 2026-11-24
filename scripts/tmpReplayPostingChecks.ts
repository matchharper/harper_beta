/**
 * Temporary A/B replay (not committed): replays real Career chat turns read-only
 * with the current checkout and counts web_search/open_url calls and Exa usage.
 *
 *   NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server \
 *     pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/tmpReplayPostingChecks.ts --arm after --out <file> --turns req,req
 */
import { config } from "dotenv";
import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const option = (name: string, fallback = "") => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const ARM = option("--arm"), OUT = option("--out"), TURNS = option("--turns").split(",").filter(Boolean);
const CONCURRENCY = Number(option("--concurrency", "3"));
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
type Row = Record<string, any>;

// Shared public page cache writes behave as in production; every other DB write
// (logs, usage, telemetry) is answered locally and never reaches the database.
const ALLOWED_WRITES = [/\/rest\/v1\/rpc\/career_capture_public_source_v1$/, /\/rest\/v1\/rpc\/career_claim_public_fetch_v1$/, /\/rest\/v1\/documents$/];
const realFetch = globalThis.fetch;
let blockedWrites = 0;
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (url.startsWith(URL_BASE) && !["GET", "HEAD"].includes(method) && !ALLOWED_WRITES.some(p => p.test(new URL(url).pathname))) {
    const rpc = new URL(url).pathname.startsWith("/rest/v1/rpc/");
    if (!rpc || !/^(match_talent_context_memories|read_career_internal_role_v1|career_opportunity_list_revision|set_timeout_and_execute_raw_sql)$/.test(new URL(url).pathname.split("/").at(-1)!)) {
      blockedWrites++;
      return new Response("[]", { status: 201, headers: { "content-type": "application/json" } });
    }
  }
  return realFetch(input, init);
}) as typeof fetch;

let current: Row | null = null;

async function main() {
  // Load every changed module now so this process keeps the version on disk at start.
  const [{ previewCareerBackgroundTurn }, web, exaMod, usageMod, debugUsage, searchOutput] = await Promise.all([
    import("@/lib/career/chatTurn"), import("@/lib/agentTools/web"), import("@/lib/tools/exaClient"),
    import("@/lib/llm/usageContext"), import("@/lib/llm/debugUsage"), import("@/lib/career/matching/searchOutput"),
    import("@/lib/llm/toolDescriptions"), import("@/lib/career/handbooks/registry"), import("@/lib/career/handbooks/opportunitySearch"),
    import("@/lib/career/prompts/mainPrompt2"), import("@/lib/talentOnboarding/openUrlTool"), import("@/lib/talentOnboarding/roleContextFormat"),
    import("@/lib/talentOnboarding/tools"),
  ]);
  console.log(`READY ${ARM}`);

  const exa = exaMod.getExaClient() as any;
  const search = exa.search.bind(exa), contents = exa.getContents.bind(exa);
  exa.search = async (q: string, o: unknown) => { const r = await search(q, o); const s = current;
    if (s) { s.exaSearch++; s.exaSearchUsd += r.costDollars?.total ?? 0; } return r; };
  exa.getContents = async (u: string[], o: unknown) => { const r = await contents(u, o); const s = current;
    if (s) { s.exaContents++; s.exaContentsUrls += u.length; s.exaContentsUsd += r.costDollars?.total ?? 0; } return r; };

  const full = createClient(URL_BASE, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) as any;

  const cutoffAdmin = (sourceId: number, sourceAt: string) => createClient(URL_BASE, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (async (input: any, init?: RequestInit) => {
      const url = new URL(String(input));
      const name = url.pathname.split("/").at(-1) ?? "";
      if (init?.method === "POST" && url.pathname.startsWith("/rest/v1/rpc/") &&
        ["match_talent_context_memories", "read_career_internal_role_v1", "career_opportunity_list_revision", "set_timeout_and_execute_raw_sql"].includes(name)) {
        for (const [key, value] of Object.entries(JSON.parse(String(init.body)))) url.searchParams.set(key, String(value));
        return realFetch(url, { ...init, method: "GET", body: undefined, cache: "no-store" });
      }
      if (init?.method && !["GET", "HEAD"].includes(init.method)) throw new Error("Preview permits only database reads");
      // The conversation as it stood when the person sent this message.
      if (name === "talent_messages") url.searchParams.append("id", `lte.${sourceId}`);
      if (name === "talent_opportunity_recommendation") url.searchParams.append("created_at", `lt.${sourceAt}`);
      return realFetch(url, { ...init, cache: "no-store" });
    }) as typeof fetch },
  }) as any;

  const walk = (value: unknown, found: Row[] = []): Row[] => {
    if (Array.isArray(value)) value.forEach(v => walk(v, found));
    else if (value && typeof value === "object") {
      const row = value as Row;
      if (typeof row.callId === "string" && typeof row.name === "string") found.push(row);
      Object.values(row).forEach(v => walk(v, found));
    }
    return found;
  };

  async function replay(requestId: string) {
    const { data: logs } = await full.from("logs").select("meta_data").eq("type", "web_search_exa")
      .eq("meta_data->attribution->>requestId", requestId).limit(200);
    const attribution = logs?.[0]?.meta_data?.attribution;
    if (!attribution) throw new Error(`No turn ${requestId}`);
    const sourceId = Number(attribution.sourceMessageId);
    const { data: source } = await full.from("talent_messages").select("*").eq("id", sourceId).single();
    const { data: later } = await full.from("talent_messages").select("id,payload").eq("conversation_id", source.conversation_id)
      .gt("id", sourceId).eq("role", "assistant").order("id").limit(20);
    const callIds = new Set(logs.map((l: Row) => l.meta_data.attribution.callId));
    const events = new Map<string, Row>();
    for (const message of later ?? []) for (const e of walk(message.payload)) events.set(e.callId, e);
    const original = [...events.values()];
    if (!original.some(e => callIds.has(e.callId))) throw new Error(`Original tool events for ${requestId} not found`);
    const runs = original.filter(e => e.name === "search_opportunities")
      .map(e => String(e.execution?.output ?? e.research?.text ?? "").match(/Search run ([0-9a-f-]{36})/)?.[1]).filter(Boolean) as string[];

    const stats: Row = { arm: ARM, requestId, userId: source.user_id, message: String(source.content).slice(0, 60),
      tools: {} as Record<string, number>, calls: [] as Row[], exaSearch: 0, exaSearchUsd: 0, exaContents: 0, exaContentsUrls: 0, exaContentsUsd: 0,
      openUrlLive: 0, openUrlUrls: 0, searchIndex: 0, originalRuns: runs.length,
      original: { web_search: original.filter(e => e.name === "web_search").length, open_url: original.filter(e => e.name === "open_url").length } };
    const admin = cutoffAdmin(sourceId, source.created_at);
    const usage: any[] = [];
    let text = "";
    let lastStatus = "";
    const started = Date.now();
    const abort = AbortSignal.timeout(15 * 60_000);
    try {
      current = stats;
      await usageMod.withLlmUsageContext({ requestId: crypto.randomUUID(), previewUsage: usage }, () =>
        previewCareerBackgroundTurn({ admin, userId: source.user_id, conversationId: source.conversation_id,
          existingSourceMessage: source, abortSignal: abort,
          // The status Harper wrote for the call that starts next (stripped from the tool input).
          onThinkingLog: (status: string) => { lastStatus = status; } } as any, {
          onComplete: (value: string) => { text = value; },
          onModelTurn: () => undefined,
          executeTool: async ({ name, input, executeRead }: { name: string; input: Row; executeRead: () => Promise<unknown> }) => {
            stats.tools[name] = (stats.tools[name] ?? 0) + 1;
            const urls = name === "open_url" ? [input.url].flat() : [];
            stats.calls.push({ name, ...(input.query ? { query: String(input.query).slice(0, 120) } : {}),
              ...(urls.length ? { urls: urls.length, maxAgeHours: input.maxAgeHours } : {}), ...(input.action ? { action: input.action } : {}),
              ...(lastStatus ? { ui: lastStatus.slice(0, 120) } : {}) });
            lastStatus = "";
            if (name === "web_search")
              return web.executeSharedWebSearch(input, { admin: full, resourceRefs: true, logging: { admin: full, attribution: { source: "replay" } } });
            if (name === "open_url") {
              stats.openUrlUrls += urls.length;
              if (input.maxAgeHours === 0) stats.openUrlLive++;
              const result: any = await web.executeSharedOpenUrl({ admin: full, resourceRefs: true, input });
              for (const page of Array.isArray(result?.pages) ? result.pages : [result]) {
                if (page?.ok === false) stats.openUrlFailed = (stats.openUrlFailed ?? 0) + 1;
                else if (page?.cached === true) stats.openUrlCacheHits = (stats.openUrlCacheHits ?? 0) + 1;
                else stats.openUrlFetched = (stats.openUrlFetched ?? 0) + 1;
              }
              return result;
            }
            if (name === "search_opportunities" && input.action !== "read" && input.action !== "cancel") {
              // A new search in the original turn: return the same saved run it produced.
              const runId = runs[Math.min(stats.searchIndex++, runs.length - 1)];
              if (!runId) return { status: "preview_skipped", modelOutput: "This search was not executed in the read-only preview." };
              return searchOutput.renderSearch(admin, { userId: source.user_id, runId, poolMatchingId: typeof input.matchingId === "string" ? input.matchingId : undefined });
            }
            if (/^(read_|list_|get_)/.test(name) || (name === "search_opportunities" && input.action === "read")) return executeRead();
            if (name === "upsert_plan") return { status: "previewed", modelOutput: "Plan shown to the person." };
            return { status: "preview_skipped", modelOutput: "This action was not executed in the read-only preview. It has no side effects." };
          },
        }));
    } catch (error) {
      stats.error = error instanceof Error ? error.message : String(error);
    }
    const summary = debugUsage.summarizeLlmDebugCalls(usage);
    Object.assign(stats, { elapsedSec: Math.round((Date.now() - started) / 1000), llmCalls: summary.completionCount,
      llmUsd: summary.estimatedCostUsd, replyChars: text.length, reply: text.slice(0, 600) });
    delete stats.searchIndex;
    appendFileSync(OUT, JSON.stringify(stats) + "\n");
    console.log(`${ARM} ${requestId} web_search=${stats.tools.web_search ?? 0} open_url=${stats.tools.open_url ?? 0} exaSearch=${stats.exaSearch} exaContents=${stats.exaContents} ${stats.error ?? ""}`);
  }

  const queue = [...TURNS];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const next = queue.shift()!;
      try { await replay(next); } catch (error) { console.error(next, error); appendFileSync(OUT, JSON.stringify({ arm: ARM, requestId: next, fatal: String(error) }) + "\n"); }
    }
  }));
  console.log(`DONE ${ARM} blockedWrites=${blockedWrites}`);
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
