import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
const ROOT = process.cwd();
const TASK = "career-job-search-plan";
const DIR = path.join(ROOT, "docs/evaluation", TASK);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const privateJson = (p: string, v: unknown) => {
  writeFileSync(p, JSON.stringify(v, null, 2) + "\n", { mode: 0o600 });
  chmodSync(p, 0o600);
};
const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();

// Evaluate the current runtime source without writing or copying its prompt.
function expose(relative: string, names: string[], overrides: Record<string, unknown> = {}) {
  const filename = path.join(ROOT, relative);
  const source = readFileSync(filename, "utf8") + `\nexport { ${names.join(", ")} };\n`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = createRequire(filename);
  const scopedRequire = (id: string) => {
    if (id in overrides) return overrides[id];
    if (id === "server-only") return {};
    if (id.startsWith("@/")) return localRequire(path.join(ROOT, "src", id.slice(2)));
    return localRequire(id);
  };
  const mod = { exports: {} as any };
  new Function("require", "module", "exports", "__filename", "__dirname", compiled)(
    scopedRequire, mod, mod.exports, filename, path.dirname(filename)
  );
  return mod.exports;
}

// Structural checks only. All qualitative assessment is manual against frozen gold.
function structuralErrors(p: any): string[] {
  if (!p || typeof p !== "object" || Array.isArray(p)) return ["not_object"];
  const errors: string[] = [];
  for (const k of ["include_contract", "include_parttime", "include_intern", "includeRemote", "remoteOnly"]) {
    if (typeof p[k] !== "boolean") errors.push(`${k}:boolean_required`);
  }
  if (![-1, 0, 1].includes(p.is_prefer_entry)) errors.push("is_prefer_entry:invalid");
  if (typeof p.searchIntentSummary !== "string" || !p.searchIntentSummary.trim()) errors.push("searchIntentSummary:required");
  for (const k of ["locations", "role_titles"]) {
    if (!Array.isArray(p[k]) || p[k].some((v: any) => typeof v !== "string")) errors.push(`${k}:string_array_required`);
  }
  if (!Array.isArray(p.role_titles) || p.role_titles.length === 0) errors.push("role_titles:empty");
  if (!Array.isArray(p.ftsKeywords) || p.ftsKeywords.some((g: any) =>
    !Array.isArray(g?.terms) || g.terms.some((v: any) => typeof v !== "string") || typeof g.weight !== "number"
  )) errors.push("ftsKeywords:invalid");
  if (!("postingRecency" in p)) errors.push("postingRecency:required");
  if (p.postingRecency !== null && p.postingRecency !== undefined) {
    if (typeof p.postingRecency !== "object" || Array.isArray(p.postingRecency)) errors.push("postingRecency:invalid");
    else for (const k of ["recentDays", "maxAgeDays", "recentWeight", "olderWeight"]) {
      const v = p.postingRecency[k];
      if (v !== null && v !== undefined && (typeof v !== "number" || !Number.isFinite(v))) errors.push(`postingRecency.${k}:invalid`);
    }
  }
  return errors;
}

async function main() {
  const fixtureRaw = readFileSync(path.join(DIR, "cases-v1.json"), "utf8");
  const goldRaw = readFileSync(path.join(DIR, "gold-v1.json"), "utf8");
  const fixture = JSON.parse(fixtureRaw);
  const gold = JSON.parse(goldRaw);
  if (fixture.cases.length !== 1 || gold.caseId !== fixture.cases[0].id) throw new Error("Frozen case/gold mismatch");
  const input = fixture.cases[0].input;
  let captured: any;
  const runtime = expose("src/lib/talentOnboarding/jobPostingRecommendations.ts", ["buildSearchPlan", "normalizeExternalSearchPlan"], {
    "@/lib/talentOnboarding/llm": { runTalentAssistantCompletion: async (args: any) => {
      captured = args;
      return JSON.stringify({ searchIntentSummary: "capture", ftsKeywords: [], role_titles: ["Engineer"], locations: [], includeRemote: true, remoteOnly: false, include_contract: false, include_parttime: false, include_intern: false, is_prefer_entry: 0, postingRecency: null });
    } },
  });
  await runtime.buildSearchPlan(input);
  if (!captured || captured.messages.length !== 3 || !captured.messages[2].content.includes(input.request)) throw new Error("Production input capture failed");
  const promptFingerprint = sha(JSON.stringify(captured.messages));
  const api = expose("src/lib/llm/llm.ts", ["buildChatCompletionRequestParts"]);
  const adapter = await import("../src/lib/llm/responsesChatAdapter");
  const usageApi = await import("../src/lib/llm/usageLogging");
  const models = [
    { label: "GLM 5.3 Flash high", model: "z-ai/glm-5.3-flash", effort: "high" },
    { label: "GPT-6 Luna low", model: "gpt-6-luna", effort: "low" },
    { label: "GPT-6.1 Sol low", model: "gpt-6.1-sol", effort: "low" },
  ];
  const sourceFiles = ["src/lib/talentOnboarding/jobPostingRecommendations.ts", "src/lib/talentOnboarding/llm.ts", "src/lib/career/llm.ts", "src/lib/llm/llm.ts", "src/lib/llm/responsesChatAdapter.ts", "src/lib/llm/modelConfig.ts"];
  const manifest = {
    task: TASK, datasetVersion: "v1", goldVersion: "v1", createdAt: new Date().toISOString(),
    sourceRevision: git("rev-parse", "HEAD"), dirty: Boolean(git("status", "--porcelain", "--", ...sourceFiles)),
    sourceDiffFingerprint: sha(git("diff", "HEAD", "--", ...sourceFiles)),
    sourceFingerprints: Object.fromEntries(sourceFiles.map(f => [f, sha(readFileSync(path.join(ROOT, f), "utf8"))])),
    fixtureHash: sha(fixtureRaw), goldHash: sha(goldRaw), promptFingerprint,
    temperature: captured.temperature, jsonMode: captured.jsonMode, timeoutMs: 180000,
    repetitions: 3, plannedCalls: 9, retries: 0, fallback: false, models,
    provenance: fixture.provenance, qualitativeReviewer: "Codex; independent human review unavailable",
    latencyMetric: "full non-streaming API completion; client/network/provider/cache included",
  };
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ ok: true, ...manifest, inputChars: JSON.stringify(captured.messages).length }));
    return;
  }
  const runId = new Date().toISOString().replace(/[:.]/g, "");
  const runDir = path.join(DIR, "runs", runId);
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  chmodSync(runDir, 0o700);
  privateJson(path.join(runDir, "manifest.json"), { ...manifest, runId });
  privateJson(path.join(runDir, "input.json"), captured);
  const results: any[] = [];
  for (let round = 0; round < 3; round++) {
    for (let offset = 0; offset < 3; offset++) {
      const entry = models[(round + offset) % 3];
      const parts = api.buildChatCompletionRequestParts({
        buildRequest: () => ({ messages: captured.messages, temperature: captured.temperature,
          response_format: { type: "json_object" },
          ...(entry.model.includes("/") ? { provider: { data_collection: "deny" } } : {}) }),
        chatCompletionReasoning: { reasoningEffort: entry.effort },
      }, entry.model);
      const isOpenAI = parts.provider === "openai";
      const request = isOpenAI ? adapter.buildOpenAIResponsesRequest({ model: entry.model,
        reasoningEffort: entry.effort as any, requestBody: parts.rawRequestBody }) : parts.requestBody;
      const sdk = parts.llmClient.withOptions({ maxRetries: 0, timeout: 180000 });
      const callIndex = results.length + 1;
      const startedAt = new Date().toISOString();
      console.log(JSON.stringify({ event: "call_start", callIndex, round: round + 1, model: entry.model, reasoning: entry.effort }));
      privateJson(path.join(runDir, `${callIndex}-request.json`), request);
      const started = performance.now();
      let result: any;
      try {
        const providerResponse = isOpenAI
          ? await sdk.responses.create(request, { signal: AbortSignal.timeout(180000) })
          : await sdk.chat.completions.create(request, { signal: AbortSignal.timeout(180000) });
        const durationMs = performance.now() - started;
        const response = isOpenAI ? adapter.toChatCompletionFromOpenAIResponse(providerResponse) : providerResponse;
        const raw = response.choices?.[0]?.message?.content ?? "";
        let parsed: any = null;
        let parseError: string | null = null;
        try { parsed = JSON.parse(raw); } catch (e) { parseError = String(e); }
        result = { callIndex, round: round + 1, label: entry.label, model: entry.model, reasoning: entry.effort,
          provider: parts.provider, startedAt, durationMs, actualModel: providerResponse.model,
          upstreamProvider: providerResponse.provider ?? null, finishReason: response.choices?.[0]?.finish_reason,
          raw, parsed, parseError, structuralErrors: parseError ? ["invalid_json"] : structuralErrors(parsed),
          normalized: parsed ? runtime.normalizeExternalSearchPlan(parsed, input.request, input.outputLanguage) : null,
          usage: usageApi.extractLlmTokenUsage(response), providerUsage: providerResponse.usage,
          providerResponseId: providerResponse.id,
        };
        privateJson(path.join(runDir, `${callIndex}-response.json`), providerResponse);
      } catch (e) {
        result = { callIndex, round: round + 1, label: entry.label, model: entry.model, reasoning: entry.effort,
          provider: parts.provider, startedAt, durationMs: performance.now() - started, error: String(e), structuralErrors: ["api_error"] };
      }
      results.push(result);
      privateJson(path.join(runDir, "results.json"), results);
      console.log(JSON.stringify({ event: "call_end", callIndex, model: entry.model,
        seconds: +(result.durationMs / 1000).toFixed(3), errors: result.structuralErrors, usage: result.usage }));
    }
  }
  const summary = models.map(entry => {
    const r = results.filter(row => row.model === entry.model);
    const s = r.filter(row => !row.error).map(row => row.durationMs / 1000).sort((a,b) => a-b);
    return { ...entry, successful: s.length, structurallyValid: r.filter(row => row.structuralErrors.length === 0).length,
      secondsInCallOrder: r.map(row => +(row.durationMs / 1000).toFixed(3)),
      meanSeconds: s.length ? s.reduce((a,b) => a+b,0)/s.length : null,
      medianSeconds: s.length === 3 ? s[1] : null, minSeconds: s[0] ?? null, maxSeconds: s.at(-1) ?? null };
  });
  privateJson(path.join(runDir, "summary.json"), summary);
  privateJson(path.join(runDir, "manifest.json"), { ...manifest, runId, completedAt: new Date().toISOString(),
    metricSummary: summary, rawArtifactPath: path.relative(ROOT, runDir), completedCalls: results.length });
  console.log(JSON.stringify({ event: "complete", runDir, summary }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
