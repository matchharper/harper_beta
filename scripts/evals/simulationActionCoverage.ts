// Synthetic stage-3 evaluation only; no database or real candidate records.
import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import { GPT_6_LUNA_MODEL } from "../../src/lib/llm/modelConfig";
import { SIMULATION_PROMPTS } from "../../src/lib/career/simulation/prompts";
import {
  simulationSchemas,
  stageOutputIssues,
  type StructuredResult,
} from "../../src/lib/career/simulation/structured";

async function main() {
  const requirements = [
    {
      id: "R1",
      requirement: "Own payment API delivery",
      importance: 3,
      mandatory: true,
      rationale: "Central task",
      source: "JD: Own payment APIs",
      evidenceNeeded: "Delivery scope",
      requirementType: "qualification",
    },
    {
      id: "R2",
      requirement: "Production observability and incident diagnosis",
      importance: 2,
      mandatory: false,
      rationale: "Core operating responsibility",
      source: "JD: Monitor production and diagnose incidents",
      evidenceNeeded: "Monitoring or diagnosis work",
      requirementType: "qualification",
    },
    {
      id: "R3",
      requirement: "Five years of engineering experience",
      importance: 3,
      mandatory: true,
      rationale: "Explicit minimum",
      source: "JD: Minimum five years engineering experience",
      evidenceNeeded: "Experience duration",
      requirementType: "qualification",
    },
  ];
  const diagnoses = [
    {
      requirementId: "R1",
      match: "met",
      presentation: "weak",
      rationale:
        "Profile confirms ownership, resume only says worked on payments",
      target: "Atlas payments",
      questions: [],
      evidence: [
        {
          id: "E1",
          source: "profile",
          location: "Atlas",
          quote: "Owned implementation of the payment API and its release.",
        },
      ],
    },
    {
      requirementId: "R2",
      match: "unknown",
      presentation: "absent",
      rationale:
        "Production API work is present but monitoring experience is unstated",
      target: "Atlas",
      questions: ["Have you monitored production APIs or diagnosed incidents?"],
      evidence: [],
    },
    {
      requirementId: "R3",
      match: "unmet",
      presentation: "clear",
      rationale:
        "Candidate explicitly confirms only two years total engineering experience",
      target: "Career duration",
      questions: [],
      evidence: [
        {
          id: "E2",
          source: "profile",
          location: "Career duration",
          quote: "I have exactly two years of engineering experience in total.",
        },
      ],
    },
  ];
  const rubric = {
    summary: "API role",
    report: "Source: supplied JD",
    data: { kind: "role", requirements } as StructuredResult,
  };
  const comparison = {
    summary: "API delivery with unknown operations work",
    report: "Duration is a confirmed gap",
    data: {
      kind: "comparison",
      diagnoses,
      observations: [],
    } as StructuredResult,
  };
  const input = {
    language: "Korean",
    role: "Own payment APIs. Monitor production and diagnose incidents. Minimum five years engineering experience.",
    resume:
      "Atlas — Engineer, 2024–2026\n- Worked on payment services.\n- Built internal dashboards.",
    candidate:
      "Owned implementation of the payment API and its release. I have exactly two years of engineering experience in total. No monitoring information is available.",
    rubric,
    comparison,
  };
  const response = await new OpenAI().chat.completions.create({
    model: GPT_6_LUNA_MODEL,
    reasoning_effort: "medium",
    messages: [
      { role: "system", content: SIMULATION_PROMPTS.review },
      { role: "user", content: JSON.stringify(input) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "simulation_review",
        strict: true,
        schema: simulationSchemas.review,
      },
    },
    max_completion_tokens: 6500,
  });
  const output = JSON.parse(response.choices[0].message.content ?? "null");
  const issues = stageOutputIssues(output, "review", [rubric, comparison]);
  await writeFile(
    "/tmp/simulation-action-coverage-eval.json",
    JSON.stringify({ input, output, issues }, null, 2)
  );
  console.log(
    JSON.stringify({
      issues,
      actions: output.data.actions.length,
      result: "/tmp/simulation-action-coverage-eval.json",
    })
  );
  if (issues.length) process.exitCode = 1;
}
void main();
