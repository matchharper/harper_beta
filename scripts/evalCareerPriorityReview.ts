import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
const root = path.resolve("docs/evaluation/career-priority-review");
const inputPath = path.join(root, "private/fixture-v1.json");
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function privateWrite(file: string, value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
}
function value(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
async function main() {
  const { getTalentSupabaseAdmin } =
    await import("../src/lib/talentOnboarding/admin");
  const { capturePriorityReviewTestInput, runPriorityReviewResponseTest } =
    await import("../src/lib/career/priorityReviewTests.server");
  const { PRIORITY_REVIEW_TEST_EMAIL, isPriorityReviewTestCase } =
    await import("../src/lib/career/priorityReviewTestContract");
  const { resolveCareerTextChatModel } =
    await import("../src/lib/career/textChatModelConfig");
  const { getLlmChatProviderForModel } = await import("../src/lib/llm/llm");
  const { CAREER_LLM_CONFIG } = await import("../src/lib/career/llm");
  const datasetText = readFileSync(path.join(root, "cases-v1.json"), "utf8");
  const dataset = JSON.parse(datasetText);
  if (
    dataset.task !== "career-priority-review" ||
    dataset.datasetVersion !== "v1" ||
    dataset.cases.length !== 3 ||
    !dataset.cases.every((item: any) => isPriorityReviewTestCase(item.id))
  )
    throw new Error("Invalid frozen dataset");
  if (process.argv.includes("--capture")) {
    if (existsSync(inputPath))
      throw new Error(
        "Frozen fixture already exists; use it or create a new version."
      );
    const admin = getTalentSupabaseAdmin();
    const { data: user, error } = await admin
      .from("talent_users")
      .select("user_id")
      .eq("email", PRIORITY_REVIEW_TEST_EMAIL)
      .single();
    if (error || !user)
      throw new Error(error?.message ?? "QA talent account missing");
    const fixture = await capturePriorityReviewTestInput({
      admin,
      userId: user.user_id,
    });
    mkdirSync(path.dirname(inputPath), { recursive: true, mode: 0o700 });
    chmodSync(path.dirname(inputPath), 0o700);
    privateWrite(inputPath, fixture);
    privateWrite(path.join(path.dirname(inputPath), "capture-v1.json"), {
      capturedAt: new Date().toISOString(),
      readOnly: true,
      fixtureHash: sha256(JSON.stringify(fixture)),
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
    });
    console.log("Captured owner-only frozen fixture with SELECT queries.");
    return;
  }
  const iterations = Number(value("--iterations") ?? 2);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10)
    throw new Error("iterations must be 1-10");
  const fixture = JSON.parse(readFileSync(inputPath, "utf8"));
  const model = resolveCareerTextChatModel(value("--model"));
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(root, "runs", runId);
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  chmodSync(outputDir, 0o700);
  const summaries: unknown[] = [];
  const sourceFiles = [
    "src/lib/career/priorityReviewTests.server.ts",
    "src/lib/career/priorityReviewTestSandbox.ts",
    "src/lib/talentOnboarding/tools.ts",
    "src/lib/career/prompts/conversationPlan.ts",
    "src/lib/career/prompts/rawPrompts.ts",
    "src/lib/career/llm.ts",
  ];
  const manifest = {
    task: dataset.task,
    datasetVersion: "v1",
    runId,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim()
    ),
    sourceFingerprint: sha256(
      sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n")
    ),
    diffFingerprint: sha256(
      execFileSync("git", ["diff", "--", ...sourceFiles], { encoding: "utf8" })
    ),
    fixtureHash: sha256(JSON.stringify(fixture)),
    datasetHash: sha256(datasetText),
    model,
    provider: getLlmChatProviderForModel(model.model),
    reasoning:
      model.chatCompletionReasoningEffort ??
      model.openAIResponsesReasoningEffort ??
      "production model default",
    sampling: { temperature: CAREER_LLM_CONFIG.chat.temperature },
    timeout: "production Career provider/fallback; API maxDuration 300s",
    rawArtifactPath: outputDir,
    metrics: summaries,
    humanReview: "pending; no keyword/regex grading",
  };
  // Persist provenance before generation, including for failed/partial runs.
  privateWrite(path.join(outputDir, "manifest.json"), manifest);
  try {
    for (let iteration = 1; iteration <= iterations; iteration++) {
      for (const testCase of dataset.cases) {
        console.log(`Running ${iteration}/${iterations}: ${testCase.id}`);
        const result = await runPriorityReviewResponseTest({
          fixture,
          caseId: testCase.id,
          message: dataset.message,
          model: model.model,
        });
        privateWrite(
          path.join(outputDir, `${iteration}-${testCase.id}.json`),
          result
        );
        const structuralPass =
          result.requestCount === testCase.expectedRequests &&
          result.recommendationCount === testCase.expectedRecommendations;
        summaries.push({
          iteration,
          caseId: testCase.id,
          structuralPass,
          promptFingerprint: result.promptFingerprint,
          elapsedMs: result.elapsedMs,
        });
        privateWrite(path.join(outputDir, "manifest.json"), manifest);
        console.log(
          `Requests ${result.requestCount}, recommendations ${result.recommendationCount}; structural ${structuralPass ? "PASS" : "FAIL"}`
        );
      }
    }
  } catch (error) {
    privateWrite(path.join(outputDir, "error.json"), {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    privateWrite(path.join(outputDir, "manifest.json"), manifest);
  }
  console.log(`Raw responses and manifest saved under ${outputDir}`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
