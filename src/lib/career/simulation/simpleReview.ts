import { simulationSchemas, type StructuredResult } from "./structured";

// The current analysis generates decisions and edits, not an evidence-ID graph.
// Stable UI identifiers are assigned after generation and are not model work.
export function simpleReviewSchema() {
  const schema = structuredClone(simulationSchemas.review);
  delete schema.properties!.report;
  schema.required = schema.required!.filter((k) => k !== "report");
  const data = schema.properties!.data;
  delete data.properties!.actionCoverage;
  data.required = data.required!.filter((k) => k !== "actionCoverage");
  const comparison = structuredClone(
    simulationSchemas.comparison.properties!.data
  );
  delete comparison.properties!.observations;
  comparison.required = comparison.required!.filter(
    (k) => k !== "observations"
  );
  const diagnosis = comparison.properties!.diagnoses.items!;
  for (const key of ["evidence", "questions"]) {
    delete diagnosis.properties![key];
    diagnosis.required = diagnosis.required!.filter((k) => k !== key);
  }
  data.properties!.comparison = comparison;
  data.required!.push("comparison");
  const action = data.properties!.actions.items!;
  for (const key of [
    "id",
    "requirementIds",
    "evidenceIds",
    "linkedActionIds",
    "executionPrompt",
    "originalText",
    "suggestedText",
    "questions",
    "needsConfirmation",
  ]) {
    delete action.properties![key];
    action.required = action.required!.filter((k) => k !== key);
  }
  action.properties!.options = {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["label"],
      properties: { label: { type: "string" } },
    },
    maxItems: 2,
  };
  return schema;
}

export function normalizeSimpleReview(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const v = value as { data?: Record<string, unknown> };
  const d = v.data;
  if (d?.kind !== "review" || !Array.isArray(d.actions)) return value;
  const c = d.comparison as Record<string, unknown> | undefined;
  if (!c || !Array.isArray(c.diagnoses)) return value;
  return {
    ...v,
    report: "",
    data: {
      ...d,
      comparison: {
        ...c,
        observations: [],
        diagnoses: c.diagnoses.map((r) => ({
          ...r,
          evidence: [],
          questions: [],
        })),
      },
      actions: d.actions.map((a, i) => ({
        ...a,
        id: `A${i + 1}`,
        originalText: "",
        suggestedText: "",
        questions: a.inputKind === "question" ? [a.title] : [],
        needsConfirmation: a.inputKind === "question",
        requirementIds: [],
        evidenceIds: [],
        linkedActionIds: [],
        executionPrompt: a.proposal,
        options: Array.isArray(a.options)
          ? a.options.map((o: Record<string, unknown>, j: number) => ({
              ...o,
              id: `option-${j + 1}`,
            }))
          : [],
      })),
    },
  };
}

export function simpleReviewDecisionIssues(data: StructuredResult): string[] {
  if (data.kind !== "review") return [];
  return data.actions.flatMap((a, i) =>
    a.inputKind === "question" &&
    (a.options?.length ?? 0) > 0 &&
    (a.options?.length !== 2 ||
      a.options.some((o) => !o.label.trim()) ||
      new Set(a.options.map((o) => o.label)).size !== 2)
      ? [
          `data.actions[${i}].options: use no options for an open-ended question, or two distinct concise choices for a real decision`,
        ]
      : []
  );
}
