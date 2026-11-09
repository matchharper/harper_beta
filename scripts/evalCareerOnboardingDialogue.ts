/** Synthetic multi-turn conversations. No DB or external actions. */
import { config } from "dotenv";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
config({ path: ".env.local", quiet: true });

async function main() {
  process.umask(0o077);
  const { buildCareerConversationPromptPlan } = await import("../src/lib/career/prompts/conversationPlan");
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { resolveCareerTextChatModel, isCareerTextChatModelId } = await import("../src/lib/career/textChatModelConfig");
  const { hasTalentOnboardingCompletionMarker } = await import("../src/lib/talentOnboarding/completion");
  const modelArg = process.argv.find(arg => arg.startsWith("--model="))?.slice(8);
  if (modelArg && !isCareerTextChatModelId(modelArg)) throw Error("Unknown model");
  const model = resolveCareerTextChatModel(modelArg);
  const root = "docs/evaluation/career-onboarding-dialogue";
  const fixtures = JSON.parse(readFileSync(`${root}/cases-v1.json`, "utf8"));
  const dir = `${root}/runs/text-${Date.now()}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, data: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(data, null, 2), { mode: 0o600 });
  const sources = ["scripts/evalCareerOnboardingDialogue.ts", `${root}/cases-v1.json`, "src/lib/career/prompts/conversationPlan.ts", "src/lib/career/prompts/rawPrompts.ts", "src/lib/career/prompts/conversationSections.ts", "src/lib/talentOnboarding/insightChecklist.ts", "src/lib/career/llm.ts"];
  save("manifest", { model, simulator: "gpt-6.1-sol", sources: Object.fromEntries(sources.map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])) });
  const context = new AsyncLocalStorage<string>();
  const requests = new Map<string, number>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const host = new URL(input instanceof Request ? input.url : String(input)).hostname;
    if (!["api.openai.com", "api.anthropic.com"].includes(host)) throw Error(`Blocked non-model destination: ${host}`);
    const label = context.getStore() ?? "unknown";
    const count = (requests.get(label) ?? 0) + 1; requests.set(label, count);
    if (init?.body) save(`${label}-provider-${count}`, JSON.parse(String(init.body)));
    return originalFetch(input, init);
  };
  try {
    const results = await Promise.allSettled(fixtures.cases.map(async (item: any) => {
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [...item.history, { role: "user", content: item.opening }];
      const plan = buildCareerConversationPromptPlan({
        channel: "chat", isOnboardingDone: false, profile: null,
        structuredProfileText: item.profile, talentContextSection: item.saved,
        // Deliberately stale historical coverage must not influence the prompt.
        onboardingChecklistCoverage: item.legacyCoverage,
        currentPreferences: { preferredLocale: "ko" }, toolNames: [],
        requestTime: new Date("2026-11-08T07:00:00Z"), timeZone: "Asia/Seoul",
      });
      save(`${item.id}-plan`, plan);
      let completed = false;
      for (let turn = 0; turn < 10; turn++) {
        const reply = await context.run(`${item.id}-${turn}-harper`, () => runCareerChatAssistant({
          ...model, primaryModel: model.model, responseLocale: "ko", systemBlocks: plan.promptBlocks,
          messages, tools: [], executeTool: async () => { throw Error("No tools in synthetic text fixture"); }, usageLabel: "eval:onboarding-dialogue",
        }));
        save(`${item.id}-${turn}-reply`, reply);
        const content = reply;
        if (typeof content !== "string") throw Error("Missing assistant content");
        messages.push({ role: "assistant", content });
        console.log(item.id, "Harper:", content);
        save(`${item.id}-conversation`, { messages, gold: item.gold, completed: hasTalentOnboardingCompletionMarker(content) });
        if (hasTalentOnboardingCompletionMarker(content)) { completed = true; break; }
        const response = await context.run(`${item.id}-${turn}-user`, () => fetch("https://api.openai.com/v1/responses", {
          method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-6.1-sol", store: false, reasoning: { effort: "low" }, instructions: `You simulate a Korean career onboarding user for a development evaluation. Answer only the latest question naturally and briefly using the persona below. Do not volunteer every remaining fact, invent facts, coach Harper or decide completion. If already answered, point that out. If not in persona, say it is undecided. Persona: ${item.persona}`, input: messages.map(m => ({ role: m.role === "assistant" ? "user" : "assistant", content: m.content })) }),
        }));
        if (!response.ok) throw Error(`Simulator HTTP ${response.status}`);
        const raw = await response.json(); save(`${item.id}-${turn}-simulator`, raw);
        const answer = raw.output.flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
        messages.push({ role: "user", content: answer });
        console.log(item.id, "User:", answer);
      }
      save(`${item.id}-conversation`, { messages, gold: item.gold, completed });
      if (!completed) process.exitCode = 1;
    }));
    for (const result of results) if (result.status === "rejected") { console.error(result.reason); process.exitCode = 1; }
  } finally { globalThis.fetch = originalFetch; }
  console.log(`Artifacts: ${dir}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
