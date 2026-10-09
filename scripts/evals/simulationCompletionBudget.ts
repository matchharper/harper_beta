// Compare old/new completion budgets through the production provider adapter.
// Synthetic candidate only; no database reads/writes.
import { writeFile } from "node:fs/promises";
import {
  runTalentAssistantCompletion,
  type TalentCompletionMetadata,
} from "../../src/lib/talentOnboarding/llm";
import { completeSimulationStage } from "../../src/lib/career/simulation/completion";
import { GPT_6_LUNA_MODEL } from "../../src/lib/llm/modelConfig";
import { SIMULATION_PROMPTS } from "../../src/lib/career/simulation/prompts";
import {
  simulationSchemas,
  stageOutputIssues,
  type StructuredResult,
} from "../../src/lib/career/simulation/structured";

async function main() {
  const skills = [
    "API ownership",
    "Production monitoring",
    "Incident diagnosis",
    "Model quality evaluation",
    "Data pipeline validation",
    "Customer workflow discovery",
    "Deployment automation",
    "Security reviews",
    "Latency optimization",
    "Cross-team documentation",
    "Distributed tracing",
    "Cost attribution",
    "Load testing",
    "Retrieval quality",
    "Data privacy",
    "Release rollback",
    "Schema migration",
    "Customer support tooling",
  ];
  const requirements = skills.map((skill, i) => ({
    id: `R${i + 1}`,
    requirement: skill,
    importance: 2 as const,
    mandatory: false,
    rationale: "Core role responsibility",
    source: `JD: ${skill}`,
    evidenceNeeded: `Personal contribution to ${skill}`,
    requirementType: "qualification" as const,
  }));
  const facts = skills.map(
    (skill, i) =>
      `Project ${i + 1}: I personally implemented ${skill.toLowerCase()} for an internal service, working with the product team. No metrics were recorded.`
  );
  const resume = skills
    .map((_, i) => `Project ${i + 1}\n- Contributed to the internal service.`)
    .join("\n");
  const rubric = {
    summary: "Engineering role",
    report: "Ten independent work areas",
    data: { kind: "role", requirements } as StructuredResult,
  };
  const comparison = {
    summary:
      "Profile contains ten independent contributions that the resume omits",
    report: "No measured outcomes available",
    data: {
      kind: "comparison",
      observations: [],
      diagnoses: skills.map((_, i) => ({
        requirementId: `R${i + 1}`,
        match: "met",
        presentation: "weak",
        rationale:
          "Profile confirms specific contribution but resume is generic",
        target: `Project ${i + 1}`,
        questions: [],
        evidence: [
          {
            id: `E${i + 1}`,
            source: "profile",
            location: `Project ${i + 1}`,
            quote: facts[i],
          },
        ],
      })),
    } as StructuredResult,
  };
  const input = JSON.stringify({
    language: "Korean",
    role: skills.join("; "),
    candidate: facts.join("\n"),
    resume,
    rubric,
    comparison,
  });
  const results = await Promise.allSettled(
    [6500, 18000].map(async (budget) => {
      const started = Date.now();
      let metadata: TalentCompletionMetadata | undefined;
      const response =
        budget === 6500
          ? {
              text: await runTalentAssistantCompletion({
                primaryModel: GPT_6_LUNA_MODEL,
                openAIResponsesReasoningEffort: "medium",
                maxTokens: budget,
                jsonSchema: {
                  name: "simulation_review",
                  strict: true,
                  schema: simulationSchemas.review,
                },
                messages: [
                  { role: "system", content: SIMULATION_PROMPTS.review },
                  { role: "user", content: input },
                ],
                abortSignal: AbortSignal.timeout(150000),
                onCompletionMetadata: (m) => {
                  metadata = m;
                },
              }),
            }
          : await completeSimulationStage({
              key: "review",
              attempt: 1,
              system: SIMULATION_PROMPTS.review,
              input,
            });
      let output: unknown;
      let issues: string[];
      try {
        output = JSON.parse(response.text);
        issues = stageOutputIssues(output, "review", [rubric, comparison]);
      } catch {
        issues = ["invalid JSON"];
      }
      return {
        budget,
        durationMs: Date.now() - started,
        metadata: metadata ?? response,
        output,
        issues,
      };
    })
  );
  await writeFile(
    "/tmp/simulation-budget-eval.json",
    JSON.stringify(results, null, 2)
  );
  for (const result of results) {
    console.log(
      result.status === "fulfilled"
        ? {
            budget: result.value.budget,
            durationMs: result.value.durationMs,
            issues: result.value.issues,
          }
        : String(result.reason)
    );
  }
}
void main();
