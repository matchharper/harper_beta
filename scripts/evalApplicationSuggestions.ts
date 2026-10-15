import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const {
    isCareerTextChatModelId,
    DEFAULT_CAREER_TEXT_CHAT_MODEL,
    resolveCareerTextChatModel,
  } = await import("../src/lib/career/textChatModelConfig");
  const modelArg = process.argv.indexOf("--model");
  const model =
    modelArg >= 0 ? process.argv[modelArg + 1] : DEFAULT_CAREER_TEXT_CHAT_MODEL;
  if (!isCareerTextChatModelId(model))
    throw new Error("Unknown evaluation model");
  const task = "docs/evaluation/application-suggestions",
    runId = new Date().toISOString().replace(/[:.]/g, "-"),
    dir = task + "/runs/" + runId;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, data: unknown) =>
    writeFileSync(dir + "/" + name + ".json", JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
  const hash = (s: string | Buffer) =>
    createHash("sha256").update(s).digest("hex");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit
  ) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    if (!["api.openai.com", "api.anthropic.com"].includes(url.hostname))
      throw new Error("Evaluation blocked non-provider network access");
    if (typeof init?.body === "string") {
      const requested = JSON.parse(init.body).model;
      if (requested && requested !== model)
        throw new Error("Evaluation blocked an unintended model");
    }
    return realFetch(input, init);
  }) as typeof fetch;
  const { writeApplicationSuggestions, APPLICATION_SUGGESTION_PROMPT } =
    await import("../src/lib/career/simulation/suggestionWriter");
  const versionArg = process.argv.indexOf("--dataset");
  const version = versionArg < 0 ? "v1" : process.argv[versionArg + 1];
  if (!["v1", "v2", "editorial-v1"].includes(version)) throw new Error("Unknown dataset");
  const cases = JSON.parse(readFileSync(task + `/cases-${version}.json`, "utf8"));
  const results = [];
  for (const fixture of cases) {
    const start = Date.now();
    try {
      const suggestions = await writeApplicationSuggestions({
        ...fixture,
        model,
        admin: {} as never,
        userId: "synthetic",
        signal: AbortSignal.timeout(180000),
        readTool: async () => ({
          results: [],
          text: "No additional saved facts beyond the supplied synthetic snapshot.",
        }),
      });
      results.push({
        id: fixture.id,
        durationMs: Date.now() - start,
        structuralPass: true,
        suggestions,
      });
    } catch (error) {
      results.push({
        id: fixture.id,
        durationMs: Date.now() - start,
        structuralPass: false,
        error: String(error),
      });
    }
    save("outputs", results);
    console.log(
      JSON.stringify({
        id: fixture.id,
        ...results.at(-1),
        suggestions: undefined,
      })
    );
  }
  save("manifest", {
    task: "application-suggestions",
    datasetVersion: version,
    runId,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"])
      .toString()
      .trim(),
    dirtyDiffHash: hash(
      execFileSync("git", [
        "diff",
        "--",
        "src/lib/career/simulation",
        "src/lib/talentOnboarding/llm.ts",
      ])
    ),
    sourceHashes: Object.fromEntries(
      ["suggestionWriter.ts", "suggestionSchema.ts"].map((f) => [
        f,
        hash(readFileSync("src/lib/career/simulation/" + f)),
      ])
    ),
    editorialContractHash: hash(readFileSync("src/lib/career/prompts/resumePolicy.ts")),
    promptFingerprint: hash(APPLICATION_SUGGESTION_PROMPT),
    fixtureHash: hash(readFileSync(task + `/cases-${version}.json`)),
    goldHash: hash(readFileSync(task + `/gold-${version}.json`)),
    model,
    provider: model.startsWith("claude-") ? "Anthropic" : "OpenAI",
    reasoning:
      resolveCareerTextChatModel(model).openAIResponsesReasoningEffort ??
      resolveCareerTextChatModel(model).chatCompletionReasoningEffort ??
      "provider default",
    temperature: 0.2,
    timeoutMs: 180000,
    metrics: {
      structuralPass: results.filter((r) => r.structuralPass).length,
      total: results.length,
      semanticReview: "pending",
    },
    rawArtifacts: dir,
  });
  console.log(dir);
  if (results.some((r) => !r.structuralPass)) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
