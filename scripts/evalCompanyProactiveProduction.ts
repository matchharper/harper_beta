/** Read-only production inspection. No company messages, jobs or external effects. */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const root = path.resolve(__dirname, "..");
const task = path.join(root, "docs/evaluation/company-side-conversational-qa");
const option = (name: string) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const command = process.argv[2];
const runId = option("run");
if (!["capture", "fork", "run"].includes(command) || !runId || !/^[a-z0-9-]+$/.test(runId)) {
  throw Error("Use capture|fork|run --run=<fresh-id> [--workspaces=<exact UUIDs>] [--from=<captured-run>] [--only=P01,...]");
}
process.umask(0o077);
const dir = path.join(task, "runs", runId);
if (command !== "run") mkdirSync(dir, { mode: 0o700 });
if (!existsSync(dir)) throw Error("Capture the inputs first");
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const save = (file: string, value: unknown) => writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const read = (file: string) => JSON.parse(readFileSync(path.join(dir, file), "utf8"));
const localEffects = command === "run" ? read("manifest.json").localEffects === true : option("effects") === "local";
const contractFile = localEffects ? "production-proactive-v2.md" : "production-proactive-v1.md";
config({ path: path.join(root, ".env.local"), quiet: true });
const dbUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
if (!["zzojrniuppueizhnmqfd.supabase.co", "auth.matchharper.com"].includes(dbUrl.hostname)) throw Error("Unexpected production project");
const model = "gpt-6.1-sol";
const reasoning = "high";
const scope = new AsyncLocalStorage<{ unit: string }>();
const realFetch = globalThis.fetch;
let networkSequence = 0;
const pendingCaptures: Promise<void>[] = [];
const blockedNetwork: unknown[] = [];
const readonlyRpc = new Set([
  "list_company_agent_slack_threads_v1", "summarize_company_contact_index_v1",
  "list_company_contact_index_v2", "read_company_candidate_delivery_v1",
  "list_company_followup_rows_v1", "company_followup_source_v1",
]); // Production STABLE bodies inspected before use.
globalThis.fetch = (async (input: any, init: any) => {
  const requestObject = input instanceof Request ? input : null;
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  const method = String(init?.method ?? requestObject?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : requestObject && !["GET", "HEAD"].includes(method) ? await requestObject.clone().text() : null;
  const isDb = url.origin === dbUrl.origin && url.pathname.startsWith("/rest/v1/");
  const isRpc = url.pathname.startsWith("/rest/v1/rpc/");
  const isRead = ["GET", "HEAD"].includes(method) && !isRpc;
  const isReadRpc = ["GET", "HEAD", "POST"].includes(method) && isRpc && readonlyRpc.has(url.pathname.slice("/rest/v1/rpc/".length));
  const isProvider = url.origin === "https://api.openai.com" && url.pathname === "/v1/responses" && method === "POST" && JSON.parse(body ?? "{}").model === model;
  const isWebRead = (url.origin === "https://api.exa.ai" && ["/search", "/contents"].includes(url.pathname) && method === "POST") || (url.hostname === "jobs.ashbyhq.com" && method === "GET");
  if (!(isDb && (isRead || isReadRpc)) && !(command === "run" && (isProvider || isWebRead))) {
    const denied = { unit: scope.getStore()?.unit, method, path: `${url.origin}${url.pathname}` };
    blockedNetwork.push(denied);
    throw Error(`Inspection network effect blocked: ${method} ${url.origin}${url.pathname}`);
  }
  const sequence = ++networkSequence;
  const unit = scope.getStore()?.unit ?? "setup";
  const startedAt = new Date().toISOString();
  const started = performance.now();
  // Headers (including service-role/API credentials) are deliberately excluded.
  const record = { sequence, unit, kind: isProvider ? "provider" : isWebRead ? "web_read" : "database_read", method, url: url.toString(), body, startedAt };
  const file = `${command}-${unit}-request-${sequence}.json`;
  try {
    const response = await realFetch(input, init);
    pendingCaptures.push(response.clone().text().then(raw => {
      save(file, { ...record, status: response.status, elapsedMs: Math.round(performance.now() - started), response: raw });
    }).catch(error => { save(file, { ...record, status: response.status, error: String(error) }); }));
    return response;
  } catch (error) {
    save(file, { ...record, elapsedMs: Math.round(performance.now() - started), error: String(error) });
    throw error;
  }
}) as typeof fetch;

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const databaseAdmin: any = createClient(dbUrl.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  // Explicit pre-migration observation mode only. Never synthesize live promotion
  // history: the new column is unavailable, while all existing flags are read live.
  const admin: any = localEffects ? new Proxy(databaseAdmin, { get(target, key) {
    if (key !== "from") { const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value; }
    return (table: string) => {
      const query = target.from(table);
      if (table !== "company_internal_roles") return query;
      return new Proxy(query, { get(q, property) {
        if (property === "select") return (columns: string, ...rest: any[]) => q.select(columns.split(",").filter(c => c.trim() !== "promotion_demand").join(","), ...rest);
        const value = Reflect.get(q, property, q); return typeof value === "function" ? value.bind(q) : value;
      } });
    };
  } }) : databaseAdmin;
  const { buildOrgAgentPromptContext } = await import("../src/lib/org/agent/context");
  const { buildCompanyProactiveReviewPrompt } = await import("../src/lib/org/agent/proactiveReview");
  const { runOrgAgentToolLoop, runOrgAgentCompletion } = await import("../src/lib/org/agent/chat");
  const { executeOrgAgentTool } = await import("../src/lib/org/agent/toolExecution");
  const { OrgAgentToolInputError } = await import("../src/lib/org/agent/toolAvailability");
  const { extractLlmTokenUsage, estimateLlmUsageCost } = await import("../src/lib/llm/usageLogging");
  const { parseHarperSlackChoiceMarkers, buildHarperSlackChoiceBlocks } = await import("../src/lib/org/slackChoiceButtons");
  const { renderSlackOrgLinks } = await import("../src/lib/org/slackTalentLinks");
  const { convertMarkdownLinksToSlackMrkdwn } = await import("../src/lib/org/slackMessages");
  const { loadSlackOrgLinkTargets } = await import("../src/lib/org/slackOrgLinkTargets.server");
  const { parseCompanyMessages } = await import("../src/lib/org/agent/companyMessaging");
  const sources = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src/lib/org/agent", "src/lib/org/teamAccess.ts", "src/lib/org/server.ts", "src/lib/org/slackHarper.ts", "src/lib/org/slackTalentLinks.ts", "src/lib/org/slackOrgLinkTargets.server.ts", "src/lib/org/slackChoiceButtons.ts", "src/lib/org/slackMessages.ts", "src/lib/companyFirstSearch/history.ts", "src/lib/agentTools/web.ts", "src/lib/tools", "src/lib/talentOnboarding/openUrlTool.ts", "src/lib/llm", "scripts/evalCompanyProactiveProduction.ts"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(file => existsSync(path.join(root, file))).sort();
  const sourceHashes = Object.fromEntries(sources.map(file => [file, sha(readFileSync(path.join(root, file)))]));
  const sourceFingerprint = sha(JSON.stringify(sourceHashes));
  const check = async (query: any) => { const { data, error } = await query; if (error) throw error; return data; };
  if (command === "fork") {
    const from = option("from");
    if (!from || !/^[a-z0-9-]+$/.test(from)) throw Error("Existing capture run required");
    const origin = path.join(task, "runs", from);
    const previous = JSON.parse(readFileSync(path.join(origin, "manifest.json"), "utf8"));
    for (const entry of previous.units) {
      const raw = readFileSync(path.join(origin, entry.inputFile));
      if (sha(raw) !== entry.inputHash) throw Error("Original frozen input changed");
      writeFileSync(path.join(dir, entry.inputFile), raw, { mode: 0o600 });
    }
    save("manifest.json", { ...previous, runId, createdAt: new Date().toISOString(),
      inputCaptureRunId: previous.inputCaptureRunId ?? previous.runId,
      inputCaptureSourceFingerprint: previous.inputCaptureSourceFingerprint ?? previous.sourceFingerprint,
      sourceFingerprint, sourceHashes, results: [], executionStatus: "not_started" });
    save("source-snapshot.json", sources.map(file => ({ file, content: readFileSync(path.join(root, file), "utf8") })));
    console.log(JSON.stringify({ runId, inputCaptureRunId: from, units: previous.units.length, sameFrozenInitialInputs: true }));
    return;
  }
  if (command === "capture") {
    const ids = option("workspaces")?.split(",") ?? [];
    if (!ids.length || ids.some(id => !/^[0-9a-f-]{36}$/.test(id))) throw Error("Exact Workspace IDs required");
    const manifest: any = {
      task: "company-side-conversational-qa", contract: contractFile, localEffects, runId,
      capturedAt: new Date().toISOString(), sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      sourceFingerprint, sourceHashes, model, reasoning, endpoint: "OpenAI Responses", serviceTier: "standard/default", mode: "full", timeoutMsPerUnit: 300_000,
      privacy: "Production read-only capture; raw ignored owner-only. No writes/delivery, no headers/secrets in artifacts.",
      rubricHash: sha(readFileSync(path.join(task, contractFile))), units: [], results: [],
      limitations: ["Authored operational inspection, not blind frozen benchmark", "Initial context frozen; adaptive tool reads have per-response as-of timestamps", "No scheduler, promotion, Slack transport/interaction or external effects", "General conversation plus bounded active-Role conversation references; no exhaustive history"],
    };
    save("source-snapshot.json", sources.map(file => ({ file, content: readFileSync(path.join(root, file), "utf8") })));
    for (const [index, workspaceId] of ids.entries()) await scope.run({ unit: `P${String(index + 1).padStart(2, "0")}` }, async () => {
      const unit = scope.getStore()!.unit;
      const started = performance.now();
      const workspace = await check(admin.from("company_workspace").select("company_workspace_id,company_name,is_internal").eq("company_workspace_id", workspaceId).single());
      if (!workspace.is_internal) throw Error("Only selected internal Workspaces are permitted");
      const memberships = await check(admin.from("company_user_workspace").select("company_user_id,authority,access_scope").eq("company_workspace_id", workspaceId).eq("authority", "owner").order("created_at").limit(1));
      if (!memberships.length) throw Error("Existing Owner required; no authorization bypass");
      const person = await check(admin.from("company_users").select("user_id,email,name,locale").eq("user_id", memberships[0].company_user_id).single());
      const user: any = { id: person.user_id, email: person.email, user_metadata: { name: person.name }, app_metadata: {} };
      const conversations = await check(admin.from("company_conversations").select("*").eq("company_workspace_id", workspaceId).order("last_message_at", { ascending: false, nullsFirst: false }));
      const conversation = conversations.find((c: any) => !c.role_id && !(c.team_scope?.length));
      if (!conversation) throw Error("Existing Organization-scope General conversation required");
      const latest = await check(admin.from("company_messages").select("id,created_at").eq("company_workspace_id", workspaceId).order("id", { ascending: false }).limit(1));
      const anchor = Number(latest[0]?.id ?? 0) + 1; // Read cursor only; never persisted or used by a real write.
      const context = await buildOrgAgentPromptContext({ admin, user, conversation, currentUserMessageId: anchor, includeSharedConversation: true, readAudience: "company_safe", scopeKey: `preview:${runId}:${unit}` });
      const liveRoleIds = new Set(context.roles.filter((r: any) => r.status === "active").map((r: any) => r.roleId));
      const roleConversations = conversations.filter((c: any) => liveRoleIds.has(c.role_id)).slice(0, 3);
      const references = await Promise.all(roleConversations.map(async (c: any) => {
        const messages = await check(admin.from("company_messages").select("id,role,content,created_at,message_type,metadata,slack_thread_id").eq("conversation_id", c.id).in("message_type", ["chat", "slack"]).is("metadata->companyEventUiDuplicateOf", null).lt("id", anchor).order("id", { ascending: false }).limit(5));
        return { roleId: c.role_id, conversationId: c.id, source: "persisted_role_conversation", complete: false,
          messages: messages.reverse().map((m: any) => ({ id: m.id, role: m.role, createdAt: m.created_at, threadId: m.slack_thread_id, content: m.content.slice(0, 3500), complete: m.content.length <= 3500 })) };
      }));
      const awareness = {
        asOf: new Date().toISOString(), origin: "optional scheduled review", recipientScope: "Company-safe Organization overview preview; not an actual Slack audience or human instruction",
        referenceCoverage: "Recent General context plus up to three active Role conversation excerpts. Truncated/incomplete references are not full history. Current tool reads outrank older messages.",
        recentRoleConversations: references,
        ...(localEffects ? { acquisitionHistoryCoverage: "The new acquisition-request storage is not deployed. No existing acquisition requests can be observed in this pre-release snapshot." } : {}),
      };
      const input = { unit, workspace, user, conversation, anchor, context, awareness };
      save(`${unit}-input.json`, input);
      manifest.units.push({ unit, companyName: workspace.company_name, workspaceId, inputFile: `${unit}-input.json`, inputHash: sha(readFileSync(path.join(dir, `${unit}-input.json`))), capturedAt: new Date().toISOString(), captureMs: Math.round(performance.now() - started) });
      save("manifest.json", manifest);
      console.log(JSON.stringify({ unit, captured: true, roleCount: context.roles.length, historyCount: context.conversationMessages?.length, captureMs: manifest.units.at(-1).captureMs }));
    });
    await Promise.all(pendingCaptures);
    save("capture-network-boundary.json", { blockedNetwork, readonlyRpc: [...readonlyRpc] });
    return;
  }

  if (!process.env.OPENAI_API_KEY) throw Error("OPENAI_API_KEY is required for the requested model");
  const manifest = read("manifest.json");
  if (sourceFingerprint !== manifest.sourceFingerprint || sha(readFileSync(path.join(task, contractFile))) !== manifest.rubricHash) throw Error("Source/rubric changed after capture; use a new run");
  for (const unit of manifest.units) if (sha(readFileSync(path.join(dir, unit.inputFile))) !== unit.inputHash) throw Error("Frozen input changed");
  const only = option("only")?.split(",");
  const readonlyTools = new Set(["get_talents", "read_talent", "read_role", "get_more_data", "list_contacts", "read_contact", "read_conversation_history", "prepare_candidate_connection", "open_url", "web_search"]);
  const chosen = manifest.units.filter((u: any) => !only || only.includes(u.unit));
  manifest.selectedUnits = chosen.map((u: any) => u.unit);
  save("manifest.json", manifest);
  const executeUnit = async (entry: any) => scope.run({ unit: entry.unit }, async () => {
    if (existsSync(path.join(dir, `${entry.unit}-output.json`))) throw Error("Result already exists; preserve it and use a new run");
    const input = read(entry.inputFile);
    const toolTrace: any[] = [], completions: any[] = [], workingLog: any[] = [], previewMessages: any[] = [];
    // Public page/search caching is incidental to a read. Keep new cache writes
    // in this run rather than mutating production documents during capture.
    const localDocuments: any[] = [];
    const webAdmin: any = new Proxy(admin, { get(target, key) {
      if (key !== "from") { const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value; }
      return (table: string) => {
        const query = target.from(table);
        if (table !== "documents") return query;
        const localWrite = (row: any) => {
          const stored = { ...row, id: randomUUID(), cacheStorage: "local_inspection_only" };
          localDocuments.push(stored);
          const q: any = { eq() { return q; }, select() { return q; }, single() { return Promise.resolve({ data: stored, error: null }); } };
          return q;
        };
        return new Proxy(query, { get(q, property) {
          if (property === "insert" || property === "update") return localWrite;
          const value = Reflect.get(q, property, q); return typeof value === "function" ? value.bind(q) : value;
        } });
      };
    } });
    const startedAt = new Date().toISOString(), started = performance.now();
    const signal = AbortSignal.timeout(manifest.timeoutMsPerUnit);
    let result: any = null, error: string | null = null;
    try {
      result = await runOrgAgentToolLoop({
        actorId: input.user.id, actorLabel: "Harper scheduled review", admin, context: input.context,
        conversation: input.conversation, currentUserMessageId: input.anchor, allowSilentCompletion: true,
        backgroundOrigin: "scheduled_review", capabilityMode: "full", mentions: [],
        // The inspection's explicit model is wider than the product selector's whitelist.
        model: model as Parameters<typeof runOrgAgentToolLoop>[0]["model"], responseLocale: "auto",
        readAudience: "company_safe", scopeKey: `preview:${runId}:${entry.unit}`, slackThreadId: null,
        source: "slack", user: input.user, userLabel: "optional scheduled review",
        userMessage: buildCompanyProactiveReviewPrompt(input.awareness), signal,
        onToolStatus: log => { workingLog.push({ kind: "tool_status", elapsedMs: Math.round(performance.now() - started), ...log }); },
        onVisibleProgress: async value => { workingLog.push({ kind: "progress_preview", elapsedMs: Math.round(performance.now() - started), text: value.text, externallyDelivered: false }); return false; },
      }, {
        requestTime: new Date(input.awareness.asOf),
        complete: async args => {
          const callStarted = performance.now();
          const response = await runOrgAgentCompletion({ ...args, model: model as typeof args.model, reasoningEffort: reasoning, strictModel: true });
          const usage = extractLlmTokenUsage(response.response);
          completions.push({ index: completions.length + 1, elapsedMs: Math.round(performance.now() - callStarted), actualModel: response.model,
            usage, cost: estimateLlmUsageCost(model, usage), response: response.response });
          return response;
        },
        executeTool: async args => {
          const callStarted = performance.now();
          const trace: any = { name: args.name, input: args.input, callId: args.callId, startedAt: new Date().toISOString() };
          toolTrace.push(trace);
          try {
            if (localEffects && args.name === "send_company_message") {
              const parts = parseCompanyMessages(args.input);
              for (const part of parts) {
                if (part.roleId && !input.context.roles.some((r: any) => r.roleId === part.roleId && r.status === "active")) throw new OrgAgentToolInputError("Role not available in captured scope");
                if (part.threadRef) throw new OrgAgentToolInputError("Existing thread delivery is not supported by this local preview adapter");
              }
              previewMessages.push(...parts);
              args.state.companyMessageBatch = { batchId: randomUUID(), messageIds: parts.map((_, i) => i + 1) };
              trace.localEffectSimulated = true; trace.effectExecuted = false;
              trace.result = { status: "committed", ...args.state.companyMessageBatch };
              return trace.result;
            }
            if (localEffects && args.name === "job_posting_promote") {
              const value = args.input as any;
              const role = input.context.roles.find((r: any) => r.roleId === value.roleId);
              if (!role || !["sufficient", "normal", "more_needed", "urgent"].includes(value.demand) || typeof value.reason !== "string" || !value.reason.trim()) throw new OrgAgentToolInputError("Invalid local promotion request");
              trace.localEffectSimulated = true; trace.effectExecuted = false;
              trace.result = role.isPromote !== true ? { status: "promotion_not_allowed", promotionAllowed: false, roleId: value.roleId }
                : role.status !== "active" ? { status: "role_unavailable", roleId: value.roleId }
                : { status: "recorded", roleId: value.roleId, request: { level: value.demand, reason: value.reason,
                    updatedAt: input.awareness.asOf, validUntil: new Date(Date.parse(input.awareness.asOf) + 7 * 86400000).toISOString() },
                    promotionAllowed: true, anonymous: role.isAnonymous === true, immediatePostingPerformed: false };
              return trace.result;
            }
            if (!readonlyTools.has(args.name)) { trace.effectExecuted = false; throw new OrgAgentToolInputError("Read-only preview: this action was NOT executed. No message, record, search, meeting or external effect was created. Do not claim completion; present any still-useful proposal instead."); }
            trace.result = await executeOrgAgentTool({ ...args, admin: args.name === "open_url" || args.name === "web_search" ? webAdmin : args.admin });
            return trace.result;
          } catch (failure) { trace.error = String(failure); throw failure; }
          finally { trace.elapsedMs = Math.round(performance.now() - callStarted); }
        },
      });
    } catch (failure) { error = String(failure); }
    const elapsedMs = Math.round(performance.now() - started);
    let slack: any = null;
    if (result?.reply) {
      const parsed = parseHarperSlackChoiceMarkers(result.reply);
      const targets = await loadSlackOrgLinkTargets({ admin, workspaceId: input.workspace.company_workspace_id, message: parsed.text });
      const text = convertMarkdownLinksToSlackMrkdwn(renderSlackOrgLinks({ message: parsed.text, ...targets, workspaceId: input.workspace.company_workspace_id }));
      slack = { text, blocks: buildHarperSlackChoiceBlocks({ text, choices: parsed.choices, sourceJobId: randomUUID() }), choices: parsed.choices, previewOnly: true, externallyDelivered: false };
    }
    const output = { unit: entry.unit, companyName: entry.companyName, startedAt, elapsedMs, reply: result?.reply ?? null,
      previewMessages, localEffects, interpretation: localEffects ? "Actual model and live reads; promotion persistence and terminal Slack delivery simulated locally, no external effects" : "Read-only observation",
      usage: result?.usage ?? null, estimatedCostUsd: completions.reduce((sum, c) => sum + (c.cost?.estimatedCostUsd ?? 0), 0),
      costBasis: "Observed per-request usage × official Standard token rates; estimate, not invoice", completions: completions.map(({ response: _response, ...c }) => c),
      toolTrace, workingLog, slack, error, actualExternalEffects: 0, semanticReview: "pending_manual_review" };
    save(`${entry.unit}-completions.json`, completions);
    save(`${entry.unit}-local-document-cache.json`, localDocuments);
    save(`${entry.unit}-output.json`, output);
    manifest.results.push({ unit: entry.unit, elapsedMs, completionCount: completions.length, toolCalls: toolTrace.length, blockedEffects: toolTrace.filter(t => t.effectExecuted === false).length,
      estimatedCostUsd: output.estimatedCostUsd, error, replyCharacters: output.reply?.length ?? 0, semanticReview: "pending_manual_review" });
    save("manifest.json", manifest);
    console.log(JSON.stringify(manifest.results.at(-1)));
  });
  // Two independent Workspace turns at a time; each retains its own context/trace.
  for (let i = 0; i < chosen.length; i += 2) {
    const settled = await Promise.allSettled(chosen.slice(i, i + 2).map(executeUnit));
    for (const value of settled) if (value.status === "rejected") throw value.reason;
  }
  await Promise.all(pendingCaptures);
  manifest.executionStatus = chosen.every((u: any) => manifest.results.some((r: any) => r.unit === u.unit && !r.error))
    ? chosen.length === manifest.units.length ? "complete" : "selected_complete"
    : "failed_or_incomplete";
  save("manifest.json", manifest);
  save("run-network-boundary.json", { blockedNetwork, readonlyRpc: [...readonlyRpc], actualExternalEffects: 0 });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
