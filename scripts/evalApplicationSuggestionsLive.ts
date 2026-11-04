import { config } from "dotenv";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { ApplicationSuggestionsDebugPreview, ApplicationSuggestionsDebugRun } from "../src/lib/ops/applicationSuggestionsDebug";

config({ path: ".env.local", quiet: true });
const task = "docs/evaluation/application-suggestions-live";
const flag = (name: string) => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? undefined : process.argv[index + 1]; };
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const privateDir = (dir: string) => { mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700); };
const save = (file: string, value: unknown) => { writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); chmodSync(file, 0o600); };

const sourcePaths = [
  "src/lib/career/simulation/suggestionWriter.ts", "src/lib/career/prompts/resumePolicy.ts",
  "src/lib/career/simulation/suggestionInput.ts", "src/lib/career/simulation/profileSnapshot.ts",
  "src/lib/career/simulation/jdSource.ts", "src/lib/career/simulation/suggestionSchema.ts",
  "src/lib/ops/applicationSuggestionsDebug.server.ts", "src/lib/talentOnboarding/llm.ts",
  "src/lib/talentOnboarding/talentContexts.ts", "src/lib/talentOnboarding/tools.ts", "src/lib/talentOnboarding/toolModelResult.ts", "src/lib/llm/llm.ts", "src/lib/llm/providerTrace.ts",
  "src/lib/career/textChatModelConfig.ts", "scripts/evalApplicationSuggestionsLive.ts",
];

async function main() {
  const capture = flag("capture") ?? `${task}/private/2026-10-29-daniel-live-v1/frozen-inputs.json`;
  const source = read(capture);
  const allowedTalents = new Set<string>(source.cases.map((item: { talentId: string }) => item.talentId));
  const blocked: Array<{ method: string; path: string }> = [];
  const actualFetch = globalThis.fetch;
  const databaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.hostname === databaseHost) {
      if (method === "GET" || method === "HEAD") return actualFetch(input, init);
      if (method === "POST" && url.pathname === "/rest/v1/rpc/match_talent_context_memories") {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        if (allowedTalents.has(body.p_talent_id)) return actualFetch(input, init);
      }
      blocked.push({ method, path: url.pathname });
      throw new Error(`Read-only evaluation blocked ${method} ${url.pathname}`);
    }
    if (["api.anthropic.com", "api.openai.com", "openrouter.ai"].includes(url.hostname)) return actualFetch(input, init);
    throw new Error(`Evaluation blocked non-provider external request: ${url.hostname}`);
  };
  const { previewApplicationSuggestionsDebug, executePreparedApplicationSuggestionsDebug } = await import("../src/lib/ops/applicationSuggestionsDebug.server");
  const { CLAUDE_HAIKU_MODEL } = await import("../src/lib/llm/modelConfig");
  const { isCareerTextChatModelId } = await import("../src/lib/career/textChatModelConfig");
  const model = flag("model") ?? CLAUDE_HAIKU_MODEL;
  if (!isCareerTextChatModelId(model)) throw new Error("Unknown model");
  const preparedPath = flag("prepared") ?? path.join(path.dirname(capture), "prepared-inputs-v1.json");
  if (process.argv.includes("--prepare")) {
    if (existsSync(preparedPath)) throw new Error("Frozen prepared inputs already exist; choose a new version instead of overwriting");
    const cases: Array<{ id: string; preview: ApplicationSuggestionsDebugPreview }> = [];
    for (const fixture of source.cases) {
      const preview = await previewApplicationSuggestionsDebug({ ...fixture, model, locale: "ko" });
      cases.push({ id: fixture.id, preview });
      console.log(JSON.stringify({ prepared: fixture.id, inputHash: hash(JSON.stringify(preview.input)) }));
    }
    save(preparedPath, { datasetVersion: "live-account-v1", createdAt: new Date().toISOString(), sourceCaptureHash: hash(readFileSync(capture)), cases });
    console.log(preparedPath);
    return;
  }
  const prepared = read(preparedPath);
  const fixture = prepared.cases.find((item: { id: string }) => item.id === flag("case"));
  if (!fixture) throw new Error("Select a frozen case with --case");
  if (prepared.sourceCaptureHash !== hash(readFileSync(capture))) throw new Error("Frozen source capture changed");
  if (!allowedTalents.has(fixture.preview.subject.candidate.id)) throw new Error("Prepared talent is outside the authorized capture");
  const phase = flag("phase") ?? "review";
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + fixture.id + "-" + randomUUID();
  const dir = `${task}/runs/${runId}`;
  privateDir(`${task}/runs`); privateDir(dir);
  const sources = Object.fromEntries(sourcePaths.map(file => [file, readFileSync(file, "utf8")]));
  save(`${dir}/source-snapshot.json`, sources);
  const manifest = {
    task: "application-suggestions-live", datasetVersion: prepared.datasetVersion, caseId: fixture.id, phase, runId,
    createdAt: new Date().toISOString(), sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceHashes: Object.fromEntries(Object.entries(sources).map(([file, content]) => [file, hash(content)])),
    captureHash: hash(readFileSync(capture)), preparedHash: hash(readFileSync(preparedPath)), inputHash: hash(JSON.stringify(fixture.preview.input)),
    goldHash: hash(readFileSync(`${task}/gold-live-account-v1.json`)), model, timeoutMs: 180000,
    status: "running", sourceMode: "stored_sources_only", qualityReview: "pending",
  };
  save(`${dir}/manifest.json`, manifest);
  const result: ApplicationSuggestionsDebugRun = await executePreparedApplicationSuggestionsDebug(
    { ...fixture.preview, model }, { signal: AbortSignal.timeout(180000) },
  );
  save(`${dir}/run.json`, result);
  save(`${dir}/provider-exchanges.json`, result.trace);
  const text = [
    `Case: ${fixture.id}\nPhase: ${phase}\nRole: ${result.subject.role.company} · ${result.subject.role.name}\nDocument: ${result.subject.document.fileName}\nModel: ${result.model}\nDuration: ${result.durationMs}ms\nError: ${result.error ?? "none"}`,
    ...result.suggestions.map((suggestion, index) => [
      `${index + 1}. [${suggestion.kind}] ${suggestion.title}`, `Reason: ${suggestion.reason}`,
      ...(suggestion.kind === "change" ? suggestion.edits.map(edit => `Target: ${edit.target}\nOriginal:\n${edit.originalText}\nProposed:\n${edit.suggestedText}`) : []),
      ...(suggestion.kind === "material" ? [suggestion.draftText] : []),
    ].join("\n\n")),
  ].join("\n\n---\n\n");
  writeFileSync(`${dir}/readable-output.txt`, text, { mode: 0o600 });
  save(`${dir}/manifest.json`, { ...manifest, status: result.error ? "error" : "completed", finishedAt: result.finishedAt,
    promptFingerprint: hash(JSON.stringify(result.prompt)), durationMs: result.durationMs, providerCalls: result.trace.length,
    suggestionCounts: Object.fromEntries(["change", "question", "material"].map(kind => [kind, result.suggestions.filter(value => value.kind === kind).length])),
    blockedWrites: blocked, rawArtifactPath: dir,
  });
  console.log(JSON.stringify({ caseId: fixture.id, phase, runId, durationMs: result.durationMs, count: result.suggestions.length, error: result.error, dir }));
  if (result.error) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
