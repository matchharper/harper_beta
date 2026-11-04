import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
config({ path: ".env.local", quiet: true });

async function main() {
  const { buildCareerConversationPromptPlan } =
    await import("../src/lib/career/prompts/conversationPlan");
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { resolveCareerTextChatModel, isCareerTextChatModelId } =
    await import("../src/lib/career/textChatModelConfig");
  const task = "docs/evaluation/career-conversation-version";
  const fixtureFile = process.argv.find(arg => arg.startsWith("--cases="))?.slice("--cases=".length) ?? "cases-v1.json";
  const modelArg = process.argv.find(arg => arg.startsWith("--model="))?.slice("--model=".length);
  const versionArg = process.argv.find(arg => arg.startsWith("--version="))?.slice("--version=".length);
  if (modelArg !== undefined && !isCareerTextChatModelId(modelArg)) throw new Error("Unknown Career text model");
  if (versionArg !== undefined && versionArg !== "professional" && versionArg !== "friendly") throw new Error("Unknown conversation version");
  const versions = versionArg ? [versionArg] as const : ["professional", "friendly"] as const;
  const cases = JSON.parse(readFileSync(`${task}/${fixtureFile}`, "utf8"));
  const dir = `${task}/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) =>
    writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  const sources = [
    "src/lib/career/prompts/mainPrompt2.ts",
    "src/lib/career/prompts/conversationPlan.ts",
    "src/lib/career/prompts/mainPrompts.ts",
    "src/lib/career/llm.ts",
    "scripts/evalCareerConversationVersion.ts",
    `${task}/${fixtureFile}`,
    "src/lang/ko.ts",
    "src/lang/en.ts",
  ];
  const model = resolveCareerTextChatModel(modelArg);
  save("manifest", {
    fixtureFile,
    versions,
    model,
    sources: Object.fromEntries(
      sources.map((p) => [
        p,
        createHash("sha256").update(readFileSync(p)).digest("hex"),
      ])
    ),
  });
  const originalFetch = globalThis.fetch;
  let label = "";
  let request = 0;
  globalThis.fetch = async (url, init) => {
    const address = String(url instanceof Request ? url.url : url);
    if (
      !["api.openai.com", "api.anthropic.com"].includes(
        new URL(address).hostname
      )
    )
      throw new Error(
        `Unexpected network destination: ${new URL(address).hostname}`
      );
    if (init?.body)
      save(`${label}-provider-${++request}`, JSON.parse(String(init.body)));
    return originalFetch(url, init);
  };
  try {
    for (const fixture of cases)
      for (const conversationVersion of versions) {
        label = `${fixture.id}-${conversationVersion}`;
        request = 0;
        const plan = buildCareerConversationPromptPlan({
          channel: "chat",
          isOnboardingDone: true,
          conversationVersion,
          profile: null,
          structuredProfileText:
            "Candidate: synthetic fixture. No additional personal facts.",
          talentContextSection: "",
          runtimeInstruction: fixture.context,
          currentPreferences: { preferredLocale: fixture.locale ?? "ko" },
          requestTime: new Date("2026-11-03T06:00:00Z"),
          timeZone: "Asia/Seoul",
          toolNames: [],
        });
        save(`${label}-input`, {
          systemBlocks: plan.promptBlocks,
          messages: fixture.messages,
        });
        const reply = await runCareerChatAssistant({
          ...model,
          primaryModel: model.model,
          responseLocale: fixture.locale ?? "ko",
          systemBlocks: plan.promptBlocks,
          messages: fixture.messages,
          tools: [],
          executeTool: async () => {
            throw new Error("No external actions in this fixture");
          },
          usageLabel: "eval:career-conversation-version",
        });
        save(`${label}-output`, reply);
        console.log(label, JSON.stringify(reply));
      }
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(`Artifacts: ${dir}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
