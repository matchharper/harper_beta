import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

config({ path: ".env.local", quiet: true });

async function main() {
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { CLAUDE_HAIKU_MODEL } = await import("../src/lib/llm/modelConfig");
  const { resolveCareerChatTools } = await import("../src/lib/career/llmTools");
  const { buildCareerConversationPromptPlan } = await import("../src/lib/career/prompts/conversationPlan");
  const { CAREER_HANDBOOKS } = await import("../src/lib/career/handbooks/registry");
  const { careerFormDraftSchema } = await import("../src/lib/career/forms/schema");
  const { formatCareerFormForModel } = await import("../src/lib/career/forms/format");
  const { withTalentToolAssistantInstruction } = await import("../src/lib/talentOnboarding/tools");
  const task = "docs/evaluation/career-external-application-tone";
  const fixture = JSON.parse(readFileSync(`${task}/cases-v1.json`, "utf8"));
  const dir = `${task}/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
  const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const selection = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: false, allowedToolNames: ["read_document", "suggest_form"] });
  assert.deepEqual([...selection.toolNames].sort(), ["read_document", "suggest_form"]);
  const plan = buildCareerConversationPromptPlan({
    channel: "chat", isOnboardingDone: true, profile: null,
    currentPreferences: { preferredLocale: "ko" },
    structuredProfileText: fixture.profile,
    talentContextSection: [
      "## Saved document index",
      `Document ID: ${fixture.document.id}; revision ${fixture.document.revision}; ${fixture.document.name}. Full resume text is available through read_document.`,
      "## Current external job posting",
      `${fixture.role.name}\n${fixture.role.url}\n${fixture.role.text}`,
    ].join("\n"),
    requestTime: new Date("2026-10-29T19:00:00Z"), timeZone: "Asia/Seoul",
    toolNames: selection.toolNames,
  });
  const systemBlocks = [...plan.promptBlocks, ...CAREER_HANDBOOKS.map(book => ({ key: `handbook:${book.id}`, text: book.body, cacheable: false }))];
  const sourcePaths = ["src/lib/career/prompts/rawPrompts.ts", "src/lib/career/prompts/conversationPlan.ts", "src/lib/career/llm.ts", "src/lib/career/handbooks/resume.ts", "src/lib/career/handbooks/application.ts", "src/lib/talentOnboarding/tools.ts", "src/lib/career/forms/server.ts", "scripts/evalCareerExternalApplicationTone.ts", `${task}/cases-v1.json`, `${task}/gold-v1.json`, `${task}/manifest-v1.json`];
  save("manifest", {
    dataset: "v1", gold: "v1", model: CLAUDE_HAIKU_MODEL,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirtyDiffSha256: hash(execFileSync("git", ["diff", "--binary"], { maxBuffer: 20 * 1024 * 1024 })),
    sources: Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))])),
    promptSha256: hash(JSON.stringify(systemBlocks)),
    handbooks: CAREER_HANDBOOKS.map(book => ({ id: book.id, version: book.version, sha256: hash(book.body) })),
    privacy: "Synthetic inputs; no database; only Anthropic messages endpoint; headers never captured",
  });
  const originalFetch = globalThis.fetch;
  let currentCase = "";
  let requestCount = 0;
  const requests: unknown[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.hostname, "api.anthropic.com", "Evaluation blocks non-provider network requests");
    assert.equal(url.pathname, "/v1/messages", "Evaluation only permits model messages");
    const index = ++requestCount;
    const request = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    assert.equal(request?.model, CLAUDE_HAIKU_MODEL);
    save(`${currentCase}-request-${index}`, request);
    requests.push({ caseId: currentCase, index, model: request.model, temperature: request.temperature, maxTokens: request.max_tokens, thinking: request.thinking, outputConfig: request.output_config });
    const response = await originalFetch(input, init);
    save(`${currentCase}-response-${index}`, { status: response.status, body: await response.clone().json() });
    return response;
  }) as typeof fetch;
  const results: unknown[] = [];
  try {
    for (const scenario of fixture.cases) {
      currentCase = scenario.id;
      const calls: Array<Record<string, unknown>> = [];
      const start = Date.now();
      const reply = await runCareerChatAssistant({
        primaryModel: CLAUDE_HAIKU_MODEL, responseLocale: "ko", systemBlocks,
        messages: [{ role: "user", content: scenario.message }],
        tools: selection.tools, usageLabel: "eval/external-application-tone",
        abortSignal: AbortSignal.timeout(180_000),
        executeTool: async ({ name, input }) => {
          const { _uiStatusMessage, ...args } = input;
          const call: Record<string, unknown> = { name, input: args };
          calls.push(call);
          let modelOutput: string;
          if (name === "read_document") {
            assert.equal(args.document_id, fixture.document.id);
            modelOutput = `Document ${fixture.document.id}, revision ${fixture.document.revision}\n${fixture.document.name}\nFull extracted text:\n${fixture.document.text}\nEnd of document. No further page.`;
          } else if (name === "suggest_form") {
            assert.equal(args.action, "create", "This single-turn evaluation only supports creating a proposed form");
            const form = { ...careerFormDraftSchema.parse(args.form), formId: 1, revision: 1 };
            call.form = form;
            modelOutput = formatCareerFormForModel(form);
          } else throw new Error(`No executor for ${name}`);
          call.modelOutput = modelOutput;
          return withTalentToolAssistantInstruction({ modelOutput });
        },
      });
      results.push({ caseId: currentCase, elapsedMs: Date.now() - start, user: scenario.message, calls, reply });
      save("results", results);
      console.log(JSON.stringify({ caseId: currentCase, tools: calls.map(call => call.name), elapsedMs: Date.now() - start, reply }, null, 2));
    }
  } finally {
    globalThis.fetch = originalFetch;
    save("requests", requests);
  }
  console.log(`Private evaluation artifacts: ${dir}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
