import { readFileSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
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
    runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID(),
    dir = task + "/runs/" + runId;
  const datasetRefArg = process.argv.indexOf("--dataset-ref");
  const datasetRevision = datasetRefArg < 0 ? undefined : execFileSync(
    "git", ["rev-parse", "--verify", process.argv[datasetRefArg + 1] + "^{commit}"],
    { encoding: "utf8" }
  ).trim();
  // Read a frozen registry revision without restoring files removed from the worktree.
  const readTaskFile = (name: string) => datasetRevision
    ? execFileSync("git", ["show", `${datasetRevision}:${task}/${name}`])
    : readFileSync(`${task}/${name}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(task + "/runs", 0o700);
  writeFileSync(task + "/runs/.gitignore", "*\n", { mode: 0o600 });
  const save = (name: string, data: unknown) =>
    writeFileSync(dir + "/" + name + ".json", JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
  const hash = (s: string | Buffer) =>
    createHash("sha256").update(s).digest("hex");
  const realFetch = globalThis.fetch;
  const providerRequests: unknown[] = [];
  let activeCaseId: string | undefined;
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
    const body = typeof init?.body === "string"
      ? init.body
      : input instanceof Request ? await input.clone().text() : undefined;
    if (body) {
      const parsed = JSON.parse(body);
      const requested = parsed.model;
      if (requested && requested !== model)
        throw new Error("Evaluation blocked an unintended model");
      // Capture the actual provider payload, never authorization headers.
      providerRequests.push({ caseId: activeCaseId, endpoint: url.href, body: parsed });
      save("provider-requests", providerRequests);
    }
    return realFetch(input, init);
  }) as typeof fetch;
  const { writeApplicationSuggestions, APPLICATION_SUGGESTION_PROMPT } =
    await import("../src/lib/career/simulation/suggestionWriter");
  const versionArg = process.argv.indexOf("--dataset");
  const version = versionArg < 0 ? "v1" : process.argv[versionArg + 1];
  if (!["v1", "v2", "editorial-v1"].includes(version)) throw new Error("Unknown dataset");
  const fixtures = JSON.parse(readTaskFile(`cases-${version}.json`).toString("utf8"));
  const selectedIds = process.argv.flatMap((argument, index) => argument === "--case" ? [process.argv[index + 1]] : []);
  const cases = selectedIds.length === 0 ? fixtures : fixtures.filter((fixture: { id: string }) => selectedIds.includes(fixture.id));
  if (!cases.length) throw new Error("Unknown evaluation case");
  if (selectedIds.some((id) => !cases.some((fixture: { id: string }) => fixture.id === id)))
    throw new Error("Unknown evaluation case");
  const results = [];
  for (const fixture of cases) {
    activeCaseId = fixture.id;
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
    datasetSourceRevision: datasetRevision ?? "worktree",
    taskContractHash: hash(readTaskFile("README.md")),
    selectedCaseIds: cases.map((fixture: { id: string }) => fixture.id),
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
    fixtureHash: hash(readTaskFile(`cases-${version}.json`)),
    goldHash: hash(readTaskFile(`gold-${version}.json`)),
    runnerHash: hash(readFileSync("scripts/evalApplicationSuggestions.ts")),
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
