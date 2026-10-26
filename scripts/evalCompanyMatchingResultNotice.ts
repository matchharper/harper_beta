/** Actual result-notice -> company_update -> company message on an isolated clone. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { startCompanySearchSandbox } from "./companyAgenticSearchSandbox.mjs";

const root = path.resolve(__dirname, "..");
const task = path.join(root, "docs/evaluation/company-agentic-role-search");
const option = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const runName = option("run");
const baselineName = option("baseline") ?? "bootstrap-v3";
if (!runName || ![runName, baselineName].every(value => /^[-a-zA-Z0-9_.]+$/.test(value))) throw Error("Fresh run and baseline names required");
process.umask(0o077);
const directory = path.join(task, "runs", runName);
mkdirSync(directory, { mode: 0o700 });
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const save = (file: string, value: unknown) => writeFileSync(path.join(directory, file), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const baselineFile = path.join(task, "runs", baselineName, "baseline.json");
const baseline = read(baselineFile);
if (baseline.status !== "frozen" || !baseline.modelWrittenBaseline) throw Error("An actual completed model-written baseline is required");
for (const [file, expected] of Object.entries(baseline.files)) {
  if (hash(readFileSync(path.join(path.dirname(baselineFile), file))) !== expected) throw Error(`Frozen baseline changed: ${file}`);
}
const captureDirectory = path.resolve(baseline.sourceCapture);
if (!captureDirectory.startsWith(path.join(task, "private") + path.sep)) throw Error("Private capture required");
const capture = read(path.join(captureDirectory, "manifest.json"));
const tables = read(path.join(captureDirectory, "tables.json"));
const person = tables.company_users.find((row: any) => row.user_id === capture.actorId);
const user = { id: capture.actorId, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { name: person?.name }, created_at: capture.capturedAt };
config({ path: path.join(root, ".env.local"), quiet: true });
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src/lib/org", "src/lib/companyFirstSearch", "src/lib/llm", "src/lib/career/llm.ts", "src/app/api/internal/company-first/result-notice/route.ts", "scripts/evalCompanyMatchingResultNotice.ts", "scripts/companyAgenticSearchSandbox.mjs"], { cwd: root, encoding: "utf8" }).trim().split("\n");
const sourceHashes = Object.fromEntries(files.map(file => [file, hash(readFileSync(path.join(root, file)))]));
save("source-snapshot.json", files.map(file => ({ file, content: readFileSync(path.join(root, file), "utf8") })));
const manifest: any = { task: "company-agentic-role-search", unit: "actual completed search result notice and idempotent replay", baseline: baselineFile, baselineHash: hash(readFileSync(baselineFile)), sourceHashes, startedAt: new Date().toISOString(), productionWrites: 0, externalDelivery: false, productionAuth: false, authSubstitute: "exact captured actor only", quality: "pending_semantic_review" };
save("manifest.json", manifest);

async function main() {
  const nativeFetch = globalThis.fetch;
  const blocked: unknown[] = [];
  const providerWrites: Promise<unknown>[] = [];
  let sequence = 0;
  let localAuthOrigin = "";
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    if (url.origin === localAuthOrigin && url.pathname.startsWith("/auth/v1/admin/users/")) {
      if (url.pathname !== `/auth/v1/admin/users/${user.id}`) return new Response(JSON.stringify({ error: "Uncaptured actor" }), { status: 404, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ user }), { headers: { "content-type": "application/json" } });
    }
    const provider = ["api.openai.com", "api.anthropic.com", "openrouter.ai"].includes(url.hostname);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) && !provider) {
      blocked.push({ origin: url.origin, path: url.pathname });
      throw Error(`Evaluation network blocked: ${url.origin}${url.pathname}`);
    }
    const index = ++sequence;
    const start = Date.now();
    const response = await nativeFetch(input, init);
    if (provider) providerWrites.push(response.clone().text().then(raw => save(`provider-${index}.json`, { endpoint: url.origin + url.pathname, request: typeof init?.body === "string" ? JSON.parse(init.body) : null, response: raw, status: response.status, elapsedMs: Date.now() - start })));
    return response;
  }) as typeof fetch;
  const sandbox = await startCompanySearchSandbox({ root, runDirectory: directory, baseline: baseline.database, pgPort: baseline.pgPort });
  localAuthOrigin = sandbox.url;
  process.env.NEXT_PUBLIC_SUPABASE_URL = sandbox.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-evaluation-only";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-evaluation-only";
  process.env.INTERNAL_WORKER_API_SECRET = "local-evaluation-only";
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { NextRequest } = await import("next/server");
    const { POST } = await import("../src/app/api/internal/company-first/result-notice/route");
    const admin: any = createClient(sandbox.url, "local-evaluation-only", { auth: { persistSession: false, autoRefreshToken: false } });
    const state = async () => {
      const out: any = {};
      for (const table of ["company_first_search_runs", "company_agent_web_action_jobs", "company_messages", "company_intro_candidates", "company_talent_requests", "company_talent_relays", "meeting_schedules", "talent_progress"]) {
        const rows: unknown[] = [];
        for (let offset = 0; ; offset += 1000) {
          const result = await admin.from(table).select("*").order("id").range(offset, offset + 999);
          if (result.error) throw result.error;
          rows.push(...result.data);
          if (result.data.length < 1000) break;
        }
        out[table] = rows;
      }
      return out;
    };
    const before = await state();
    save("state-before.json", before);
    const run = before.company_first_search_runs.filter((row: any) => row.contract_version === "company_agentic_role_search_v1" && row.status === "succeeded").sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (!run) throw Error("No actual completed interactive run in baseline");
    manifest.matchingRunId = run.id;
    save("manifest.json", manifest);
    for (const attempt of [1, 2]) {
      const start = Date.now();
      const response = await POST(new NextRequest("http://127.0.0.1/api/internal/company-first/result-notice", { method: "POST", headers: { authorization: "Bearer local-evaluation-only", "content-type": "application/json" }, body: JSON.stringify({ runId: run.id }) }));
      save(`response-${attempt}.json`, { status: response.status, body: await response.json(), elapsedMs: Date.now() - start });
      save(`state-after-${attempt}.json`, await state());
      if (!response.ok) throw Error(`Actual result-notice returned ${response.status}`);
    }
    manifest.executionStatus = "executed_review_pending";
  } catch (error) {
    manifest.executionStatus = "error";
    save("error.json", { error: error instanceof Error ? error.stack : String(error) });
    process.exitCode = 1;
  } finally {
    await Promise.all(providerWrites);
    save("network-boundary.json", { blocked, productionWrites: 0, externalDelivery: false });
    manifest.finishedAt = new Date().toISOString();
    manifest.sourceChangedDuringRun = files.some(file => hash(readFileSync(path.join(root, file))) !== sourceHashes[file]);
    save("manifest.json", manifest);
    await sandbox.stop();
    console.log(JSON.stringify({ run: runName, executionStatus: manifest.executionStatus }));
  }
}
main().catch(error => { save("fatal-error.json", { error: String(error) }); process.exitCode = 1; });
