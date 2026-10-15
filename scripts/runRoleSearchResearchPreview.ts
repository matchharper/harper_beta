/** Manual preview only: no database, queue, Slack, email or activation transport. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const root = path.resolve(__dirname, "..");
const task = path.join(root, "docs/evaluation/company-side-conversational-qa");
const option = (name: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const runId = option("run");
if (!runId || !/^[a-z0-9-]+$/.test(runId)) throw Error("Use --run=<fresh-id> [--dataset=v1] [--case=<ids>] [--input=<local-packet.json>]");
const dataset = option("dataset") ?? "v1";
if (!/^v[0-9]+$/.test(dataset)) throw Error("Use --dataset=v<number>");
process.umask(0o077);
const dir = path.join(task, "runs", runId);
mkdirSync(dir, { mode: 0o700 }); // Existing runs are never overwritten.
const sha = (raw: string | Buffer) => createHash("sha256").update(raw).digest("hex");
const save = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
config({ path: path.join(root, ".env.local"), quiet: true });

async function main() {
  const specPath = option("input") ? path.resolve(option("input")!) : path.join(task, `research-preview-${dataset}.json`);
  const specRaw = readFileSync(specPath);
  const spec = JSON.parse(specRaw.toString());
  const frozen = JSON.parse(readFileSync(path.join(task, `research-preview-manifest-${dataset}.json`), "utf8"));
  for (const [name, hash] of Object.entries(frozen.files)) {
    if (sha(readFileSync(path.join(task, name))) !== hash) throw Error(`Frozen file changed: ${name}`);
  }
  const selected = option("case")?.split(",");
  const units = spec.cases.filter((unit: any) => !selected || selected.includes(unit.id));
  if (!units.length || selected?.some(id => !units.some((u: any) => u.id === id))) throw Error("Select existing cases");
  for (const unit of units) {
    if (!/^[a-zA-Z0-9-]+$/.test(unit.id) || !unit.company?.name || !unit.role?.roleId || !unit.role?.request ||
      !["frozen", "live"].includes(unit.webMode) || !Array.isArray(unit.messages)) throw Error("Invalid research input packet");
  }
  if (new Set(units.map((u: any) => u.id)).size !== units.length) throw Error("Duplicate case identifiers");
  // Only model completions and public Exa reads may leave this process. DB keys
  // may be present in .env.local, but no database client/transport is allowed.
  const realFetch = globalThis.fetch;
  const network: any[] = [];
  let currentSignal: AbortSignal | undefined;
  let currentUnit = "setup";
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const provider = method === "POST" && ((url.origin === "https://openrouter.ai" && url.pathname === "/api/v1/chat/completions") ||
      (url.origin === "https://api.openai.com" && url.pathname === "/v1/responses"));
    const web = method === "POST" && url.origin === "https://api.exa.ai" && ["/search", "/contents"].includes(url.pathname);
    if (!provider && !web) throw Error(`Preview network effect blocked: ${method} ${url.origin}${url.pathname}`);
    const start = performance.now();
    const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signals = [inherited, currentSignal].filter(Boolean) as AbortSignal[];
    try {
      const response = await realFetch(input, { ...init, ...(signals.length ? { signal: AbortSignal.any(signals) } : {}) });
      network.push({ unit: currentUnit, provider: provider ? "model" : "public_web", url: url.origin + url.pathname, status: response.status, elapsedMs: Math.round(performance.now() - start) });
      return response;
    } catch (error) {
      network.push({ unit: currentUnit, url: url.origin + url.pathname, error: String(error) });
      throw error;
    }
  }) as typeof fetch;

  const { runRoleSearchResearchPreview, ROLE_SEARCH_RESEARCH_MODEL, ROLE_SEARCH_RESEARCH_REASONING_EFFORT, ROLE_SEARCH_RESEARCH_MAX_TOKENS } = await import("../src/lib/org/agent/roleSearchResearch.server");
  const { runOrgAgentCompletion } = await import("../src/lib/org/agent/chat");
  const { executeSharedWebSearch, executeSharedOpenUrl } = await import("../src/lib/agentTools/web");
  const { createMemoryDocumentCache } = await import("../src/lib/tools/memoryDocumentCache");
  const { companyEvaluationRoleRead } = await import("./lib/companyAgentEvaluationContract");
  const model = ROLE_SEARCH_RESEARCH_MODEL;
  const sourcePaths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src/lib/org/agent", "src/lib/agentTools/web.ts", "src/lib/tools", "src/lib/talentOnboarding/openUrlTool.ts", "src/lib/llm", "scripts/runRoleSearchResearchPreview.ts", "scripts/lib/companyAgentEvaluationContract.ts"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(file => existsSync(path.join(root, file)));
  const sources = [...new Set(sourcePaths)].sort().map(file => ({ file, content: readFileSync(path.join(root, file), "utf8") }));
  const sourceHashes = Object.fromEntries(sources.map(s => [s.file, sha(s.content)]));
  const manifest: any = { task: "company-side-conversational-qa/research-preview", runId,
    startedAt: new Date().toISOString(), inputHash: sha(specRaw), inputVersion: spec.version,
    frozenBenchmark: !option("input"), goldHash: frozen.files[`research-preview-gold-${dataset}.md`],
    model, reasoning: ROLE_SEARCH_RESEARCH_REASONING_EFFORT, maxTokensPerCompletion: ROLE_SEARCH_RESEARCH_MAX_TOKENS, temperature: null,
    provider: "OpenAI Responses", samplingNote: "Existing Responses adapter omits temperature",
    timeoutMsPerUnit: 240_000, sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceHashes, selected: units.map((u: any) => u.id), results: [],
    scope: "Manual preview; captured/synthetic internal reads, frozen or live public web. No database or messaging transport.",
    semanticReview: "pending", executionStatus: "running" };
  save("manifest.json", manifest); save("input.json", spec); save("source-snapshot.json", sources);

  for (const unit of units) {
    currentUnit = unit.id;
    currentSignal = AbortSignal.timeout(manifest.timeoutMsPerUnit);
    const role = { ...unit.role, status: "active", information: { testOnly: true, testFixture: "role-search-research-preview" } };
    const workspaceId = "research-preview-workspace";
    const company = unit.company;
    const history = unit.messages.map((content: string, index: number) => ({ id: index + 1, role: "user", source: "company", content, speaker: "팀원", complete: true, references: "captured or synthetic input", toolNames: [] }));
    const context: any = {
      workspace: { workspaceId, companyName: company.name, homepageUrl: company.homepageUrl, pitch: company.description, companyDescription: company.description },
      companyText: JSON.stringify(company), roles: [role], rolesText: JSON.stringify([{ roleId: role.roleId, name: role.name, status: "active" }]),
      completeRoleRequestIds: [], defaultLongTextObservations: [],
      conversationMessages: history, conversationText: "-", recentRecommendationsText: "No candidate records supplied in this packet; this does not prove none exist in the company.",
      recentContactsText: "No company contact records supplied in this packet.", summariesText: "-", contextNotesText: "Manual preview packet. Internal readers are limited to supplied evidence; public web discovery is available. Local identifiers and testOnly metadata do not represent a database fixture or any write. " + (unit.captureNotes ?? "Synthetic internal role evidence; no actual Role exists for these fixture identifiers."),
    };
    const cache = createMemoryDocumentCache(), trace: any[] = [], completions: any[] = [];
    let output: any = null, error: string | null = null;
    const start = performance.now();
    try {
      output = await runRoleSearchResearchPreview({
        context, roleId: role.roleId, responseLocale: "ko", currentUserMessageId: history.length + 1,
        conversation: { id: "manual-preview", company_workspace_id: workspaceId, role_id: role.roleId } as any,
        user: { id: "manual-preview-actor" } as any,
        admin: new Proxy({}, { get() { throw Error("No database access in manual packet preview"); } }) as any,
        signal: currentSignal,
        onToolStatus: log => console.log(JSON.stringify({ case: unit.id, tool: log.label ?? log, elapsedMs: Math.round(performance.now() - start) })),
      }, {
        requestTime: new Date(spec.asOf),
        complete: async args => {
          const c: any = { index: completions.length + 1, request: args, startedAt: new Date().toISOString() };
          completions.push(c);
          try { const result = await runOrgAgentCompletion({ ...args, strictModel: true }); c.result = result; return result; }
          catch (failure) { c.error = String(failure); throw failure; }
          finally { save(`${unit.id}-completions.json`, completions); }
        },
        executeTool: async args => {
          const x = args.input as any;
          const entry: any = { name: args.name, input: x, startedAt: new Date().toISOString() };
          trace.push(entry);
          try {
            let result: any;
            if (args.name === "web_search") {
              result = unit.webMode === "live" ? await executeSharedWebSearch(x, { admin: cache.admin })
                : { query: x.query, resultCount: unit.webResults.length, results: unit.webResults };
            } else if (args.name === "open_url") {
              if (unit.webMode === "live") result = await executeSharedOpenUrl({ admin: cache.admin, input: x });
              else {
                if (unit.pageErrors?.[x.url]) throw Error(unit.pageErrors[x.url]);
                if (!Object.hasOwn(unit.pages ?? {}, x.url)) throw Error("No captured page for this URL; content unverified");
                const body = unit.pages[x.url], limit = Math.min(40_000, Math.max(1000, Number(x.maxMarkdownChars) || 20_000));
                result = { ok: true, url: x.url, title: x.url, markdown: body.slice(0, limit), markdownCharCount: body.length, truncated: body.length > limit, cached: false };
              }
            } else if (args.name === "read_role") {
              if (x.roleId !== role.roleId) throw Error("Role not present in this captured scope");
              result = companyEvaluationRoleRead({ role, include: x.include, pipeline: { candidates: [], coverage: "No pipeline records captured" } });
            } else if (args.name === "get_more_data") {
              result = { requestedKinds: x.kinds };
              if (x.kinds?.includes("company_details")) {
                const values = { company_name: company.name, homepage_url: company.homepageUrl, workspace_request: company.workspaceRequest ?? company.description };
                result.companyDetails = { values, fields: Object.fromEntries(Object.keys(values).map(key => [key, { complete: true, truncated: false, oversized: false }])) };
              }
              if (x.kinds?.includes("members")) result.members = { complete: false, items: [], totalCount: 0, returnedCount: 0, coverage: "No Workspace account list supplied; discover public team evidence separately" };
              if (x.kinds?.includes("workspace_memory")) result.workspaceMemory = { complete: true, exists: Boolean(unit.companyMemory), content: unit.companyMemory ?? null };
              if (x.kinds?.includes("matching_runs")) throw Error("Matching history not captured; not evidence of no past runs");
            } else if (args.name === "read_conversation_history") {
              throw Error("Only the supplied conversation is available in this packet; no additional history was captured");
            } else if (["get_talents", "read_talent", "list_contacts", "read_contact"].includes(args.name)) {
              throw Error("No candidate/contact records captured for this packet; do not infer an empty company history");
            } else throw Error("Tool not supported by the read-only preview adapter");
            entry.result = structuredClone(result);
            args.state.toolResults.push({ callId: args.callId, name: args.name, status: "success", summary: "조사 자료 조회" });
            return result;
          } catch (failure) { entry.error = String(failure); throw failure; }
          finally { save(`${unit.id}-tools.json`, trace); }
        },
      });
    } catch (failure) { error = String(failure); }
    save(`${unit.id}-output.json`, { output, error, elapsedMs: Math.round(performance.now() - start), semanticReview: "pending" });
    save(`${unit.id}-documents.json`, cache.snapshot());
    if (output) writeFileSync(path.join(dir, `${unit.id}-preview.md`), output.text + "\n", { mode: 0o600 });
    manifest.results.push({ case: unit.id, error, elapsedMs: Math.round(performance.now() - start), toolCalls: trace.length, completions: completions.length, replyCharacters: output?.text?.length ?? 0 });
    save("manifest.json", manifest); save("network.json", network);
    console.log(JSON.stringify(manifest.results.at(-1)));
  }
  manifest.executionStatus = manifest.results.every((r: any) => !r.error) ? "completed" : "incomplete";
  save("manifest.json", manifest);
  if (manifest.executionStatus !== "completed") process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
