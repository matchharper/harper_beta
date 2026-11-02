import { config } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import assert from "node:assert/strict";
import Module from "node:module";
import Ajv from "ajv";

config({ path: ".env.local", quiet: true });
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://evaluation.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic", SUPABASE_SERVICE_ROLE_KEY: "synthetic", BROWSER_USE_API_KEY: "synthetic" });
process.umask(0o077);
const root = "docs/evaluation/email-application-agent";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fixture = JSON.parse(readFileSync(`${root}/cases-v2.json`, "utf8"));
const frozen = JSON.parse(readFileSync(`${root}/manifest-v2.json`, "utf8"));
for (const [name, digest] of Object.entries(frozen.hashes)) assert.equal(hash(readFileSync(`${root}/${name}`)), digest);
const onlyIndex = process.argv.indexOf("--only");
const cases = fixture.cases.filter((c: any) => onlyIndex < 0 || c.id === process.argv[onlyIndex + 1]);
assert.ok(cases.length);
const dir = `${root}/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(dir, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}`, typeof value === "string" ? value : JSON.stringify(value, null, 2), { mode: 0o600 });
const print = console.log.bind(console);
for (const level of ["log", "warn", "error"] as const) console[level] = (...values) => appendFileSync(`${dir}/runtime.log`, values.map(v => typeof v === "string" ? v : JSON.stringify(v)).join(" ") + "\n", { mode: 0o600 });
const fetchOriginal = globalThis.fetch;
let requestCount = 0;
const blocked: string[] = [];
let browserBoundary: (url: URL, init?: RequestInit) => Promise<Response>;
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "api.browser-use.com" || url.hostname === "synthetic-upload.invalid") return browserBoundary(url, init);
  if (url.hostname === "evaluation.invalid" && url.pathname === "/rest/v1/llm_logs") return new Response(null, { status: 201 });
  if (!(["api.openai.com", "api.anthropic.com", "openrouter.ai"].includes(url.hostname) && /\/(responses|chat\/completions|messages)$/.test(url.pathname))) {
    blocked.push(`${url.origin}${url.pathname}`); throw new Error("Non-provider network blocked by evaluation");
  }
  const number = ++requestCount;
  save(`request-${number}.json`, JSON.parse(String(init?.body ?? "{}")));
  const response = await fetchOriginal(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000) });
  save(`response-${number}.json`, { status: response.status, body: await response.clone().text() });
  return response;
}) as typeof fetch;
const nodeModule = Module as any, originalLoad = nodeModule._load;
nodeModule._load = function(name: string, parent: unknown, isMain: boolean) { return name === "server-only" ? {} : originalLoad.call(this, name, parent, isMain); };

async function main() {
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { CareerCapabilityRuntime } = await import("../src/lib/career/capabilities/runtime");
  const { resolveCareerChatTools } = await import("../src/lib/career/llmTools");
  const { emailAssistantModel } = await import("../src/lib/email/runtime/model");
  const { emailToolSelection, executeEmailTool, EMAIL_SHARED_TOOL_NAMES } = await import("../src/lib/email/runtime/tools");
  const { adaptEmailPromptBlocks } = await import("../src/lib/email/runtime/prompt");
  const { renderReplyEmail } = await import("../src/lib/email/runtime/format");
  const { executeSuggestForm } = await import("../src/lib/career/forms/server");
  const { executeUseBrowser } = await import("../src/lib/career/browser/tool");
  const { getCareerDocumentHref } = await import("../src/lib/career/documentLinks");
  const { getConfiguredPublicSiteUrl } = await import("../src/lib/siteUrl");
  const model = emailAssistantModel();
  const sourcePaths = ["scripts/evalEmailApplicationAgent.ts", "src/lib/email/runtime/tools.ts", "src/lib/email/runtime/prompt.ts", "src/lib/email/runtime/model.ts", "src/lib/email/runtime/format.ts", "src/lib/career/chatTurn.ts", "src/lib/career/llm.ts", "src/lib/career/capabilities/runtime.ts", "src/lib/career/capabilities/registry.ts", "src/lib/career/prompts/mainPrompt2.ts", "src/lib/career/prompts/conversationPlan.ts", "src/lib/career/browser/tool.ts", "src/lib/career/browser/links.ts", "src/lib/career/forms/server.ts", "src/lib/career/handbooks/application.ts", "src/lib/career/documentLinks.ts"];
  save("manifest.json", { model, fixtureHashes: frozen.hashes, sources: Object.fromEntries(sourcePaths.map(p => [p, hash(readFileSync(p))])), boundary: "Real Career model and form/browser executors; in-memory database and synthetic browser-provider; production renderer; no email consumer, queue or external submission." });
  for (const scenario of cases) {
    const userId = randomUUID(), conversationId = randomUUID(), documentId = randomUUID();
    let sequence = 100, turnIndex = 0;
    const runs = new Map<string, any>();
    const calls: any[] = [], results: any[] = [], checkpoints: any[] = [];
    const document = { id: documentId, talent_id: userId, revision: 1, file_name: "Gaon_Backend.pdf", file_type: "application/pdf", mime_type: "application/pdf", storage_path: "synthetic/resume.pdf", origin_type: "upload", extracted_text: fixture.candidate, is_deleted: false, kind: "resume", created_at: fixture.requestTime };
    const tables: Record<string, any[]> = { talent_messages: [], talent_external_operations: [], talent_conversations: [{ id: conversationId, user_id: userId }], talent_documents: [document], email_reply_jobs: [] };
    const valueAt = (row: any, key: string) => key.includes("->>") ? row[key.split("->>")[0]]?.[key.split("->>")[1]] : row[key];
    const admin: any = {
      storage: { from: () => ({ download: async () => ({ data: new Blob(["%PDF synthetic resume bytes"]), error: null }) }) },
      from(table: string) {
        assert.ok(tables[table], `Unexpected database table: ${table}`);
        const filters: Array<(r: any) => boolean> = []; let patch: any; let inserted: any; let sort: any; let limit = Infinity;
        const read = () => { let rows = tables[table].filter(row => filters.every(f => f(row))); if (patch) rows.forEach(row => Object.assign(row, patch)); if (sort) rows.sort((a,b) => (a[sort.key] > b[sort.key] ? 1 : -1) * (sort.asc ? 1 : -1)); return structuredClone(rows.slice(0, limit)); };
        const q: any = {
          select: () => q, eq: (key: string, value: any) => { filters.push(r => valueAt(r,key) === value); return q; },
          in: (key: string, values: any[]) => { filters.push(r => values.includes(valueAt(r,key))); return q; },
          neq: (key: string, value: any) => { filters.push(r => valueAt(r,key) !== value); return q; },
          contains: (key: string, object: any) => { filters.push(r => Object.entries(object).every(([k,v]) => r[key]?.[k] === v)); return q; },
          order: (key: string, opts: any = {}) => { sort = { key, asc: opts.ascending !== false }; return q; },
          limit: (n: number) => { limit = n; return q; },
          update: (value: any) => { patch = value; return q; },
          insert: (value: any) => { inserted = { id: ++sequence, created_at: fixture.requestTime, ...value }; tables[table].push(inserted); return q; },
          maybeSingle: async () => ({ data: read()[0] ?? null, error: null }),
          single: async () => ({ data: structuredClone(inserted ?? read()[0]), error: null }),
          then: (resolve: any, reject: any) => Promise.resolve({ data: read(), error: null }).then(resolve,reject),
        }; return q;
      },
      async rpc(name: string, input: any) {
        if (name === "create_talent_external_operation") {
          let row = tables.talent_external_operations.find(r => r.idempotency_key === input.p_idempotency_key && r.kind === input.p_kind);
          if (!row) { row = { id: randomUUID(), user_id: input.p_user_id, conversation_id: input.p_conversation_id, kind: input.p_kind, parent_id: input.p_parent_id, idempotency_key: input.p_idempotency_key, status: "reserved", revision: 1, request: input.p_request, result: {}, provider_refs: {}, created_at: fixture.requestTime, updated_at: fixture.requestTime }; tables.talent_external_operations.push(row);
            if (row.parent_id) tables.talent_external_operations.find(r => r.id === row.parent_id).status = "running";
          }
          return { data: structuredClone(row), error: null };
        }
        assert.equal(name, "write_career_form");
        const previous = tables.talent_messages.filter(r => r.payload?.formId === input.p_form_id && r.message_type === "career_form").at(-1);
        if (input.p_action === "update") assert.equal(previous?.payload.revision, input.p_expected_revision);
        const id = ++sequence;
        const payload = { ...input.p_payload, formId: input.p_form_id ?? id, revision: input.p_action === "update" ? previous.payload.revision + 1 : input.p_revision ?? 1 };
        const row = { id, user_id: userId, conversation_id: conversationId, role: "assistant", content: "", message_type: input.p_action === "present" ? "career_form_presentation" : "career_form", payload, created_at: fixture.requestTime };
        tables.talent_messages.push(row); return { data: structuredClone(row), error: null };
      },
    };
    browserBoundary = async (url, init) => {
      const route = url.pathname.replace("/api/v4", "");
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (url.hostname === "synthetic-upload.invalid") {
        assert.ok(init?.body instanceof Uint8Array && init.body.byteLength > 0);
        return new Response(null, { status: 200 });
      }
      if (route === "/workspaces") return Response.json({ id: randomUUID() });
      if (route.endsWith("/files/upload")) return Response.json({ files: body.files.map((f: any) => ({ name: f.name, path: `files/${f.name}`, uploadUrl: "https://synthetic-upload.invalid/file" })) });
      if (route.endsWith("/files")) return Response.json({ files: [], hasMore: false });
      if (route === "/browsers") return Response.json({ items: [{ status: "active", liveUrl: "https://live.browser-use.com/synthetic-secret" }], totalItems: 1 });
      if (route === "/runs" && init?.method === "POST") {
        const id = randomUUID(), sessionId = body.sessionId ?? randomUUID();
        // A repeated inspection is not a submission. Freeze observations by user
        // turn, and review every browser task against the user's current authority.
        const observation = scenario.observations[turnIndex];
        runs.set(id, { id, sessionId, status: "completed", output: observation });
        calls.push({ browserTask: body.task, turnIndex, providerSessionId: sessionId, observation });
        return Response.json({ id, sessionId, status: "running" });
      }
      if (route.startsWith("/runs/")) {
        const run = runs.get(route.split("/")[2]); assert.ok(run, "Unknown synthetic provider run");
        return Response.json(run);
      }
      throw new Error(`Unimplemented synthetic browser route ${route}`);
    };
    const selection = emailToolSelection(resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: false, allowedToolNames: EMAIL_SHARED_TOOL_NAMES }), false);
    const ajv = new Ajv({ strict: false, validateFormats: false });
    const validators = new Map(selection.tools.map(t => [t.function.name, ajv.compile(t.function.parameters)]));
    const messages: any[] = [{ role: "assistant", content: `추천드린 포지션: ${fixture.role}` }];
    for (const message of scenario.turns) {
      const source = { id: ++sequence, user_id: userId, conversation_id: conversationId, role: "user", content: message, payload: {}, message_type: "mail", created_at: fixture.requestTime };
      tables.talent_messages.push(source); messages.push({ role: "user", content: message });
      const job = { id: randomUUID(), status: "processing", locked_by: "evaluation", worker_target: "vercel_queue", metadata: {} };
      tables.email_reply_jobs.push(job);
      const ctx: any = { admin, job, owner: "evaluation", talentId: userId, conversationId, sourceMessage: source, body: message, subject: "Re: Example Atlas 백엔드 포지션", thread: "", attachments: [] };
      const scope = { admin, userId, conversationId, userMessageId: source.id, requestId: `email:${source.id}` };
      const resourceContext = () => [fixture.role, `Document ${documentId}, revision 1, Gaon_Backend.pdf. ${fixture.candidate}`, ...tables.talent_messages.filter(r => r.message_type === "career_form").map(r => `Saved form ${r.payload.formId}, revision ${r.payload.revision}; use suggest_form read for contents.`), ...tables.talent_external_operations.filter(r => r.kind === "browser_session").map(r => `Browser session_id ${r.id}; status ${r.status}; current execution_id ${r.provider_refs.current_execution_id ?? "none"}.`)].join("\n");
      const options: any = { mode: "progressive", eligibleTools: selection.tools, replyId: `message:${source.id}`,
        abortSignal: AbortSignal.timeout(300_000), continuation: { channel: "adapter", sourceMessageId: source.id, emailReplyJobId: job.id },
        checkpoint: async (checkpoint: any) => { checkpoints.push(checkpoint); },
        adaptPromptBlocks: (blocks: any) => adaptEmailPromptBlocks(blocks, ctx),
        promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: fixture.candidate, talentContextSection: resourceContext(), requestTime: new Date(fixture.requestTime), timeZone: "Asia/Seoul", currentPreferences: { preferredLocale: "ko" } }),
      };
      const runtime = new CareerCapabilityRuntime(options), step = runtime.resolveStep(false);
      const reply = await runCareerChatAssistant({ ...model, responseLocale: "ko", messages, tools: step.tools, systemBlocks: step.systemBlocks, toolRuntime: runtime,
        abortSignal: options.abortSignal, hasDeliveredArtifact: () => false, usageLabel: `eval:email-application/${scenario.id}/${turnIndex}`,
        executeTool: async ({ name, input }) => {
          const entry: any = { turnIndex, name, input }; calls.push(entry);
          const validate = validators.get(name); assert.ok(validate, `Unregistered tool ${name}`); assert.ok(validate(input), ajv.errorsText(validate.errors));
          const { _uiStatusMessage, ...command } = input;
          const toolScope = { ...scope, requestId: `${scope.requestId}:${hash(JSON.stringify({ name, command }))}` };
          const result = await executeEmailTool(ctx, { name, input: command, executeDefault: async () => {
            if (name === "suggest_form") return executeSuggestForm({ ...toolScope, input: command });
            if (name === "use_browser") return executeUseBrowser(command, toolScope);
            if (["get_role_context", "read_recommended_opportunities", "open_url", "web_search"].includes(name)) return { ok: true, modelOutput: fixture.role };
            if (["list_documents", "read_document"].includes(name)) return { ok: true, modelOutput: `Owned uploaded resume documentId: ${documentId}; revision: 1; filename: Gaon_Backend.pdf; usable attachment; content: ${fixture.candidate}\nDocument URL: ${new URL(getCareerDocumentHref(documentId), getConfiguredPublicSiteUrl()).href}` };
            if (["list_profiles", "read_profile", "read_talent_context"].includes(name)) return { ok: true, modelOutput: fixture.candidate };
            return { ok: false, modelOutput: "This synthetic execution fixture has no additional data/effect for this call. No action occurred." };
          } });
          entry.result = result; return result;
        },
      });
      assert.ok(reply.trim(), "Email needs visible body, even when a form was saved");
      const rendered = renderReplyEmail(reply); assert.ok(rendered.text.trim());
      save(`${scenario.id}-${turnIndex}.html`, rendered.html); save(`${scenario.id}-${turnIndex}.txt`, rendered.text);
      results.push({ user: message, reply, text: rendered.text }); messages.push({ role: "assistant", content: reply });
      turnIndex++;
      save(`${scenario.id}.json`, { results, calls, checkpoints, operations: tables.talent_external_operations, forms: tables.talent_messages.filter(r => r.message_type === "career_form"), manualReview: "pending" });
      print(`${scenario.id}: ${turnIndex}/${scenario.turns.length}`);
    }
    assert.ok(tables.talent_external_operations.some(r => r.kind === "browser_run"));
    print(`${scenario.id}: completed`);
  }
  assert.deepEqual(blocked, []);
  print(`Run: ${dir}`);
}
main().catch(error => { save("error.json", { error: String(error), stack: error?.stack, blocked }); print(`Failed: ${String(error)}; ${dir}`); process.exitCode = 1; }).finally(() => { globalThis.fetch = fetchOriginal; nodeModule._load = originalLoad; });
