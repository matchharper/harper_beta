// Synthetic, read-only input inspection. Uses runtime builders; never calls a model or DB.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildScoringInput, buildScoringSections, v2PromptCandidate } from "../src/lib/externalRecommendationsV2/scoringInput";
import { buildDecisionRequest, COMMON_SCORING_INSTRUCTIONS, SHARED_METRIC_RUBRICS } from "../src/lib/externalRecommendationsV2/decisions";
import { roleCard } from "../src/lib/talentOnboarding/jobPostingRecommendations";

const task = "docs/evaluation/external-recommendations-v2";
const source = readFileSync(`${task}/cases-v2.json`, "utf8");
const batch = JSON.parse(source).batches[0];
const candidates = batch.roles.map((r: any) => v2PromptCandidate(roleCard(r.row), "en"));
const input = buildScoringInput(batch.userContext, candidates);
const ids = candidates.map((c: any) => c.roleId);
const request = buildDecisionRequest("openai", input, ids);
// Preserve the previous report as the fixed baseline for this next optimization.
const baseline = JSON.parse(readFileSync(`${task}/reports/2026-10-18-scoring-input/analysis-input.json`, "utf8"));
const oldInput = baseline.v2.input;
const oldQuestions = baseline.v2.questions;
const worker = JSON.parse(execFileSync(process.env.WORKER_PYTHON ?? "python3", ["../harper_worker/scripts/inspect_external_scoring_input.py"], { input: JSON.stringify(batch), encoding: "utf8" }));
const dir = `${task}/reports/2026-10-18-scoring-input-shared-rubrics`;
mkdirSync(dir, { recursive: true });
const save = (name: string, content: string) => writeFileSync(`${dir}/${name}`, content);
const inputText = request.input!.map(message => `## ${message.role}\n${message.content}`).join("\n\n");
save("v2-input.txt", inputText);
save("v2-questions.json", JSON.stringify(request.questions, null, 2) + "\n");
save("v2-request.json", JSON.stringify(request, null, 2) + "\n");
save("v1-input.txt", worker.input);
save("v1-system.txt", worker.system);
save("analysis-input.json", JSON.stringify({
  dataset: "frozen synthetic cases-v2, batch 0, three roles", fixtureSha256: createHash("sha256").update(source).digest("hex"),
  v1: worker,
  v2: { input: inputText, oldInput, questions: request.questions, oldQuestions,
    parts: [{ name: "common_prompt", text: COMMON_SCORING_INSTRUCTIONS }, { name: "metric_rubrics", text: SHARED_METRIC_RUBRICS }, ...buildScoringSections(batch.userContext, candidates), { name: "metric_questions", text: JSON.stringify(request.questions) }] },
}, null, 2) + "\n");
console.log(dir);
