import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CareerCapabilityRuntime } from "@/lib/career/capabilities/runtime";
import { resolveCareerChatTools } from "@/lib/career/llmTools";
import { runCareerChatAssistant } from "@/lib/career/llm";
import { resolveCareerTextChatModel } from "@/lib/career/textChatModelConfig";
import { careerMainPromptForVersion } from "@/lib/career/prompts/mainPrompt2";

// Compares the Career main prompt with and without the reply-continuation
// paragraph on frozen synthetic cases. "before" removes only that paragraph
// from every provider request; everything else is the current product path.
const root = "docs/evaluation/career-reply-continuation";
const arg = (name: string) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const version = arg("version") ?? "v1";
type Variant = "before" | "after" | "light";
const variants = (arg("variants") ?? "before,after").split(",") as Variant[];
const repeat = Number(arg("repeat") ?? 2);
const concurrency = Number(arg("concurrency") ?? 4);
const onlyCases = arg("case")?.split(",");
const bytes = readFileSync(`${root}/cases-${version}.json`);
const dataset = JSON.parse(bytes.toString());
const cases = dataset.cases.filter((fixture: { id: string }) => !onlyCases || onlyCases.includes(fixture.id));
if (!cases.length) throw new Error("No evaluation cases selected");

// The evaluated section is read from the current prompt ("## Ending a reply").
const ADDED = (() => {
  const text = careerMainPromptForVersion();
  const match = text.match(/(\n## Ending a reply\n\n[^\n]+\n)/);
  if (!match) throw new Error("Evaluated paragraph not found in the current Career main prompt");
  return match[1];
})();

// "light" swaps the section for a short alternative that only asks for an easy
// way to respond when a reply would end on a plain statement.
const LIGHT =
  "\n## Ending a reply\n\nWhen a reply would otherwise end on a plain statement, close with something easy to respond to: a short question, what you suggest doing next, or reply options. Do not ask permission for work you can simply do, and let a conversation that is wrapping up close.\n";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const runId = new Date().toISOString().replaceAll(":", "-");
const output = `${root}/runs/${runId}`;
mkdirSync(output, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
const files = [
  "src/lib/career/prompts/mainPrompt2.ts",
  "src/lib/career/prompts/conversationPlan.ts",
  "src/lib/career/prompts/rawPrompts.ts",
  "src/lib/career/capabilities/runtime.ts",
  "src/lib/career/llm.ts",
  "scripts/evalCareerReplyContinuation.ts",
];
const model = resolveCareerTextChatModel(undefined);
save("manifest", {
  task: "career-reply-continuation",
  datasetVersion: dataset.datasetVersion,
  caseIds: cases.map((fixture: { id: string }) => fixture.id),
  variants,
  repeat,
  runId,
  fixtureHash: hash(bytes),
  goldHash: hash(readFileSync(`${root}/gold-${version}.json`)),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirtyDiffHash: hash(execFileSync("git", ["diff", "HEAD", "--", ...files])),
  sources: Object.fromEntries(files.map((file) => [file, hash(readFileSync(file))])),
  model,
  boundary: "Synthetic data. Tools return fixture text and execute nothing. Provider-only network.",
});

// Tools without a fixture result: reads find nothing beyond the runtime facts,
// external effects never happen, other saves succeed so ordinary flows finish.
const EXTERNAL_EFFECT_TOOLS = new Set(["contact_company", "apply_to_internal_role", "assign_to_role", "use_browser", "write_email", "write_calendar"]);
function defaultToolResult(name: string) {
  if (EXTERNAL_EFFECT_TOOLS.has(name)) return "Evaluation stub: nothing was sent, submitted or scheduled.";
  if (/^(read|list|get|search|open)_/.test(name) || name === "web_search")
    return "No further records beyond the facts already in context.";
  return "Done. The change was saved.";
}

const variantStore = new AsyncLocalStorage<{ variant: Variant; requests: unknown[] }>();

function rewrite(value: unknown, counter: { n: number }, replacement: string): unknown {
  if (typeof value === "string") {
    if (!value.includes(ADDED)) return value;
    counter.n++;
    return value.replace(ADDED, replacement);
  }
  if (Array.isArray(value)) return value.map((item) => rewrite(item, counter, replacement));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item, counter, replacement)]));
  return value;
}

async function runOne(fixture: any, variant: Variant, rep: number) {
  const calls: unknown[] = [];
  const progress: string[] = [];
  const requests: unknown[] = [];
  const eligibleTools = resolveCareerChatTools({ isOnboardingDone: true }).tools;
  const runtime = new CareerCapabilityRuntime({
    mode: "progressive",
    eligibleTools,
    allowLoaders: true,
    promptArgs: () => ({
      channel: "chat",
      isOnboardingDone: true,
      profile: null,
      structuredProfileText: "Synthetic candidate. Facts are in the conversation and the runtime context.",
      talentContextSection: "",
      careerCoachingActivity: null,
      currentPreferences: { preferredLocale: fixture.locale },
      requestTime: new Date("2026-11-23T03:00:00Z"),
      timeZone: "Asia/Seoul",
      runtimeInstruction: fixture.facts,
    }),
  });
  const step = runtime.resolveStep(false);
  const started = Date.now();
  const label = `${fixture.id}-${variant}-${rep}`;
  try {
    const result = await variantStore.run({ variant, requests }, () =>
      runCareerChatAssistant({
        ...model,
        primaryModel: model.model,
        systemBlocks: step.systemBlocks,
        tools: step.tools,
        toolRuntime: runtime,
        messages: fixture.messages,
        responseLocale: fixture.locale,
        usageLabel: "eval:career-reply-continuation",
        abortSignal: AbortSignal.timeout(300_000),
        onAssistantMessage: async (text) => {
          progress.push(text);
        },
        executeTool: async ({ name, input }) => {
          // An array gives successive results for repeated calls (e.g. before and after a save).
          const configured = fixture.toolResults?.[name];
          const seen = calls.filter((call: any) => call.name === name).length;
          const modelOutput = Array.isArray(configured)
            ? configured[Math.min(seen, configured.length - 1)]
            : configured ?? defaultToolResult(name);
          calls.push({ name, input, modelOutput });
          return { modelOutput };
        },
      })
    );
    save(label, { fixture: fixture.id, variant, rep, result, progress, calls, requests, elapsedMs: Date.now() - started });
    return { label, result, progress, calls };
  } catch (error) {
    save(label, { fixture: fixture.id, variant, rep, error: String(error), progress, calls, requests });
    return { label, error: String(error), progress, calls };
  }
}

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!["https://api.openai.com", "https://api.anthropic.com"].includes(url.origin))
      throw new Error(`Blocked evaluation network: ${url.origin}`);
    const context = variantStore.getStore();
    if (context && typeof init?.body === "string") {
      const counter = { n: 0 };
      const body = JSON.parse(init.body);
      const next = context.variant === "after" ? body : rewrite(body, counter, context.variant === "light" ? LIGHT : "");
      const text = JSON.stringify(next);
      if (context.variant === "after" && text.includes("Choose what to say by") && !text.includes(JSON.stringify(ADDED).slice(1, -1)))
        throw new Error("The current prompt no longer contains the evaluated paragraph");
      if (context.variant !== "after" && counter.n === 0 && text.includes("Choose what to say by"))
        throw new Error(`${context.variant} variant: section not replaced`);
      context.requests.push(next);
      init = { ...init, body: text };
    }
    return originalFetch(input, init);
  };
  const jobs = cases.flatMap((fixture: any) =>
    variants.flatMap((variant) => Array.from({ length: repeat }, (_, rep) => () => runOne(fixture, variant, rep + 1)))
  );
  const results: any[] = [];
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
        while (next < jobs.length) {
          const job = jobs[next++];
          const outcome = await job();
          results.push(outcome);
          console.log(`${outcome.label}: ${outcome.error ? `ERROR ${outcome.error}` : `${outcome.calls.length} tool calls`}`);
        }
      })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  results.sort((a, b) => a.label.localeCompare(b.label));
  const text = (outcome: any) =>
    typeof outcome.result === "string" ? outcome.result
      : outcome.result?.text ?? outcome.result?.assistantText ?? JSON.stringify(outcome.result);
  writeFileSync(
    `${output}/review.md`,
    results
      .map((outcome) => [
        `## ${outcome.label}`,
        `Tools: ${outcome.calls.map((call: any) => call.name).join(", ") || "none"}`,
        outcome.error ? `ERROR: ${outcome.error}` : text(outcome),
      ].join("\n\n"))
      .join("\n\n---\n\n"),
    { mode: 0o600 }
  );
  console.log(`Artifacts: ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
