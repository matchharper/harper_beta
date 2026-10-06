import type { SimulationStepKey } from "./types";

export type Requirement = {
  id: string;
  requirement: string;
  importance: 1 | 2 | 3;
  mandatory: boolean;
  rationale: string;
  source: string;
  evidenceNeeded: string;
};
export type Evidence = {
  id: string;
  source: "resume" | "profile";
  location: string;
  quote: string;
};
export type Diagnosis = {
  requirementId: string;
  match: "strong" | "met" | "partial" | "unknown" | "unmet";
  evidence: Evidence[];
  rationale: string;
  presentation: "clear" | "weak" | "absent" | "overstated" | "unavailable";
  questions: string[];
  target: string;
};
export type Observation = {
  id: string;
  target: string;
  finding: string;
  evidence: Evidence[];
};
export type Action = {
  id: string;
  category: "content" | "wording" | "structure" | "consistency";
  title: string;
  target: string;
  proposal: string;
  reason: string;
  requirementIds: string[];
  evidenceIds: string[];
  needsConfirmation: boolean;
  questions: string[];
  executionPrompt: string;
};
export type StructuredResult =
  | { kind: "role"; requirements: Requirement[] }
  | { kind: "comparison"; diagnoses: Diagnosis[]; observations: Observation[] }
  | { kind: "review"; actions: Action[]; emptyReason: string };

type Schema = {
  type: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: readonly (string | number)[];
  minItems?: number;
  maxItems?: number;
};
const str: Schema = { type: "string" };
const strings: Schema = { type: "array", items: str };
const choices = (...values: string[]): Schema => ({
  type: "string",
  enum: values,
});
const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (items: Schema, bounds = {}): Schema => ({
  type: "array",
  items,
  ...bounds,
});
const evidenceSchema = obj({
  id: str,
  source: choices("resume", "profile"),
  location: str,
  quote: str,
});
export const simulationSchemas: Record<SimulationStepKey, Schema> = {
  role: obj({
    summary: str,
    report: str,
    data: obj({
      kind: choices("role"),
      requirements: list(
        obj({
          id: str,
          requirement: str,
          importance: { type: "integer", enum: [1, 2, 3] },
          mandatory: { type: "boolean" },
          rationale: str,
          source: str,
          evidenceNeeded: str,
        }),
        { minItems: 1 }
      ),
    }),
  }),
  comparison: obj({
    summary: str,
    report: str,
    data: obj({
      kind: choices("comparison"),
      diagnoses: list(
        obj({
          requirementId: str,
          match: choices("strong", "met", "partial", "unknown", "unmet"),
          evidence: list(evidenceSchema),
          rationale: str,
          presentation: choices(
            "clear",
            "weak",
            "absent",
            "overstated",
            "unavailable"
          ),
          questions: strings,
          target: str,
        })
      ),
      observations: list(
        obj({
          id: str,
          target: str,
          finding: str,
          evidence: list(evidenceSchema),
        })
      ),
    }),
  }),
  review: obj({
    summary: str,
    report: str,
    data: obj({
      kind: choices("review"),
      actions: list(
        obj({
          id: str,
          category: choices("content", "wording", "structure", "consistency"),
          title: str,
          target: str,
          proposal: str,
          reason: str,
          requirementIds: strings,
          evidenceIds: strings,
          needsConfirmation: { type: "boolean" },
          questions: strings,
          executionPrompt: str,
        }),
        { maxItems: 10 }
      ),
      emptyReason: str,
    }),
  }),
};

function conforms(value: unknown, schema: Schema): boolean {
  if (schema.enum && !schema.enum.includes(value as string | number))
    return false;
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "integer") return Number.isInteger(value);
  if (schema.type === "array")
    return (
      Array.isArray(value) &&
      value.length >= (schema.minItems ?? 0) &&
      value.length <= (schema.maxItems ?? Infinity) &&
      value.every((v) => conforms(v, schema.items!))
    );
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    Object.keys(row).every((k) => k in schema.properties!) &&
    schema.required!.every((k) => conforms(row[k], schema.properties![k]))
  );
}
const unique = (ids: string[]) =>
  ids.every((id) => id.trim().length > 0) && new Set(ids).size === ids.length;
export function isStructuredStage(
  value: unknown,
  key: SimulationStepKey
): value is { summary: string; report: string; data: StructuredResult } {
  if (!conforms(value, simulationSchemas[key])) return false;
  const result = value as {
    summary: string;
    report: string;
    data: StructuredResult;
  };
  if (!result.summary.trim() || !result.report.trim()) return false;
  const d = result.data;
  if (d.kind === "role")
    return (
      unique(d.requirements.map((r) => r.id)) &&
      d.requirements.every((r) =>
        [r.requirement, r.rationale, r.source, r.evidenceNeeded].every((s) =>
          s.trim()
        )
      )
    );
  if (d.kind === "comparison") {
    const evidence = [
      ...d.diagnoses.flatMap((r) => r.evidence),
      ...d.observations.flatMap((r) => r.evidence),
    ];
    const byId = new Map<string, string>();
    for (const e of evidence) {
      if (![e.id, e.location, e.quote].every((s) => s.trim())) return false;
      const text = JSON.stringify([e.source, e.location, e.quote]);
      if (byId.has(e.id) && byId.get(e.id) !== text) return false;
      byId.set(e.id, text);
    }
    return (
      unique(d.diagnoses.map((r) => r.requirementId)) &&
      unique(d.observations.map((r) => r.id)) &&
      d.diagnoses.every(
        (r) =>
          r.rationale.trim() &&
          r.target.trim() &&
          (!["strong", "met", "unmet"].includes(r.match) ||
            r.evidence.length > 0)
      )
    );
  }
  return (
    unique(d.actions.map((a) => a.id)) &&
    (d.actions.length > 0 || !!d.emptyReason.trim()) &&
    d.actions.every(
      (a) =>
        [a.title, a.target, a.proposal, a.reason, a.executionPrompt].every(
          (s) => s.trim()
        ) &&
        (!a.needsConfirmation || a.questions.some((q) => q.trim()))
    )
  );
}

export function validReferences(
  data: StructuredResult,
  previous: Array<{ data?: StructuredResult } | undefined>
): boolean {
  if (data.kind === "role") return true;
  const role = previous[0]?.data;
  if (role?.kind !== "role") return false;
  const ids = new Set(role.requirements.map((r) => r.id));
  if (data.kind === "comparison")
    return (
      data.diagnoses.length === ids.size &&
      data.diagnoses.every((d) => ids.has(d.requirementId))
    );
  const comparison = previous[1]?.data;
  if (comparison?.kind !== "comparison") return false;
  const evidenceIds = new Set(
    [
      ...comparison.diagnoses.flatMap((d) => d.evidence),
      ...comparison.observations.flatMap((o) => o.evidence),
    ].map((e) => e.id)
  );
  for (const observation of comparison.observations)
    evidenceIds.add(observation.id);
  return data.actions.every(
    (a) =>
      a.requirementIds.every((id) => ids.has(id)) &&
      a.evidenceIds.every((id) => evidenceIds.has(id))
  );
}

// Diagnostics contain paths/codes only: never log resume excerpts or model output.
export function stageOutputIssues(
  value: unknown,
  key: SimulationStepKey,
  previous: Array<{ data?: StructuredResult } | undefined>
): string[] {
  const issues: string[] = [];
  const inspect = (v: unknown, schema: Schema, path: string) => {
    if (conforms(v, schema)) return;
    if (
      schema.type === "object" &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      const row = v as Record<string, unknown>;
      for (const name of Object.keys(row))
        if (!(name in schema.properties!))
          issues.push(`${path}.${name}: unexpected field`);
      for (const name of schema.required!)
        inspect(row[name], schema.properties![name], `${path}.${name}`);
    } else if (schema.type === "array" && Array.isArray(v)) {
      if (
        v.length < (schema.minItems ?? 0) ||
        v.length > (schema.maxItems ?? Infinity)
      )
        issues.push(`${path}: invalid item count`);
      v.forEach((item, i) => inspect(item, schema.items!, `${path}[${i}]`));
    } else
      issues.push(
        `${path}: expected ${schema.enum ? schema.enum.join(" | ") : schema.type}`
      );
  };
  inspect(value, simulationSchemas[key], "result");
  if (issues.length) return issues.slice(0, 30);
  const result = value as {
    summary: string;
    report: string;
    data: StructuredResult;
  };
  const d = result.data;
  if (d.kind === "comparison") {
    const evidence = [
      ...d.diagnoses.flatMap((r, i) =>
        r.evidence.map((e, j) => ({
          e,
          path: `data.diagnoses[${i}].evidence[${j}]`,
        }))
      ),
      ...d.observations.flatMap((r, i) =>
        r.evidence.map((e, j) => ({
          e,
          path: `data.observations[${i}].evidence[${j}]`,
        }))
      ),
    ];
    const seen = new Map<string, string>();
    for (const { e, path } of evidence) {
      const signature = JSON.stringify([e.source, e.location, e.quote]);
      if (seen.has(e.id) && seen.get(e.id) !== signature)
        issues.push(
          `${path}.id: reused for different source/location/quote; use a distinct ID or reuse identical evidence`
        );
      seen.set(e.id, signature);
    }
    d.diagnoses.forEach((r, i) => {
      if (["strong", "met", "unmet"].includes(r.match) && !r.evidence.length)
        issues.push(
          `data.diagnoses[${i}].evidence: this judgment requires evidence; missing information is unknown`
        );
    });
    const role = previous[0]?.data;
    if (role?.kind === "role") {
      for (const r of role.requirements)
        if (d.diagnoses.filter((x) => x.requirementId === r.id).length !== 1)
          issues.push(
            `data.diagnoses: provide exactly one diagnosis for ${r.id}`
          );
    }
  }
  if (!isStructuredStage(value, key) && !issues.length)
    issues.push(
      "result: nonempty content and unique IDs required; confirmation needs questions and zero actions needs emptyReason"
    );
  if (!validReferences(d, previous))
    issues.push(
      "data: references must resolve to the supplied frozen rubric and comparison; cover every requirement exactly once"
    );
  return issues.slice(0, 30);
}

// Constrain the model to the frozen rubric before generation, not only after it.
export function simulationSchemaForInput(
  key: SimulationStepKey,
  context: { rubric?: { data?: StructuredResult } }
): Schema {
  const schema = structuredClone(simulationSchemas[key]);
  const rubric = context.rubric?.data;
  if (
    key === "comparison" &&
    rubric?.kind === "role" &&
    rubric.requirements.length
  ) {
    const diagnoses = schema.properties!.data.properties!.diagnoses;
    diagnoses.minItems = rubric.requirements.length;
    diagnoses.maxItems = rubric.requirements.length;
    diagnoses.items!.properties!.requirementId = choices(
      ...rubric.requirements.map((r) => r.id)
    );
  }
  return schema;
}
