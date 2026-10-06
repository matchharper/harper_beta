import {
  isStructuredStage,
  validReferences,
  type StructuredResult,
} from "./structured";
export const SIMULATION_MESSAGE_TYPE = "application_simulation";
export const SIMULATION_STEPS = ["role", "comparison", "review"] as const;
export type SimulationStepKey = (typeof SIMULATION_STEPS)[number];
export type SimulationResult = {
  summary: string;
  report: string;
  data?: StructuredResult;
};
export type SimulationStep = {
  key: SimulationStepKey;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  attempts?: number;
  validationIssues?: string[];
  startedAt?: string;
  completedAt?: string;
  result?: SimulationResult;
};
export type ApplicationSimulation = {
  version: 1 | 2;
  status: "running" | "completed" | "failed" | "cancelled";
  roleName: string;
  documentName: string | null;
  updatedAt: string;
  steps: SimulationStep[];
};

export function parseApplicationSimulation(
  value: unknown
): ApplicationSimulation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const v = value as ApplicationSimulation;
  if (
    ![1, 2].includes(v.version) ||
    !["running", "completed", "failed", "cancelled"].includes(v.status) ||
    typeof v.roleName !== "string" ||
    typeof v.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(v.updatedAt)) ||
    !(v.documentName === null || typeof v.documentName === "string") ||
    !Array.isArray(v.steps) ||
    v.steps.length !== 3
  )
    return;
  for (let i = 0; i < 3; i++) {
    const s = v.steps[i];
    if (
      !s ||
      s.key !== SIMULATION_STEPS[i] ||
      !["pending", "running", "completed", "failed", "cancelled"].includes(
        s.status
      )
    )
      return;
    if (
      s.result &&
      (typeof s.result.summary !== "string" ||
        typeof s.result.report !== "string")
    )
      return;
    if (s.status === "completed" && !s.result) return;
    if (
      v.version === 2 &&
      s.result &&
      (!isStructuredStage(s.result, s.key) ||
        !validReferences(
          s.result.data!,
          v.steps.slice(0, i).map((step) => step.result)
        ))
    )
      return;
  }
  return v;
}
