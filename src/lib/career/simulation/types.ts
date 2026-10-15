import { suggestionSchema, type ApplicationSuggestion } from "./suggestionSchema";
import {
  isStructuredStage,
  hasStageShape,
  validReferences,
  type StructuredResult,
} from "./structured";
export const SIMULATION_MESSAGE_TYPE = "application_simulation";
export const SIMULATION_STEPS = ["role", "comparison", "review"] as const;
export const LIGHT_SIMULATION_STEPS = ["role", "review"] as const;
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
  completion?: {
    finishReason: string | null;
    outputCharacters: number;
    completionTokens?: number;
  };
  failureReason?:
    | "timeout"
    | "cancelled"
    | "invalid_output"
    | "provider_or_storage_error";
  validationIssues?: string[];
  startedAt?: string;
  completedAt?: string;
  result?: SimulationResult;
};
export type ApplicationSimulation = {
  version: 1 | 2 | 3 | 4 | 5 | 6;
  progress?: "candidate" | "role" | "application" | "suggestions";
  suggestions?: ApplicationSuggestion[];
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
    ![1, 2, 3, 4, 5, 6].includes(v.version) ||
    !["running", "completed", "failed", "cancelled"].includes(v.status) ||
    typeof v.roleName !== "string" ||
    typeof v.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(v.updatedAt)) ||
    !(v.documentName === null || typeof v.documentName === "string") ||
    !Array.isArray(v.steps) ||
    v.steps.length !== (v.version === 6 ? 1 : v.version >= 4 ? 2 : 3)
  )
    return;
  if(v.version === 6) {
    if(!["candidate","role","application","suggestions"].includes(v.progress ?? "")) return;
    if(v.steps[0]?.key !== "review" || !["pending","running","completed","failed","cancelled"].includes(v.steps[0].status)) return;
    if(v.suggestions && !suggestionSchema.array().max(20).safeParse(v.suggestions).success) return;
    if(v.status === "completed" && (!v.suggestions || v.steps[0].status !== "completed")) return;
    return v;
  }
  for (let i = 0; i < v.steps.length; i++) {
    const s = v.steps[i];
    if (
      !s ||
      s.key !==
        (v.version >= 4 ? LIGHT_SIMULATION_STEPS : SIMULATION_STEPS)[i] ||
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
      v.version >= 4 &&
      s.result?.data?.kind === "review" &&
      !s.result.data.comparison
    )
      return;
    if (
      v.version >= 2 &&
      s.result &&
      (v.version >= 5
        ? !hasStageShape(s.result, s.key)
        : !isStructuredStage(s.result, s.key) ||
          !validReferences(
            s.result.data!,
            v.steps.slice(0, i).map((step) => step.result)
          ))
    )
      return;
  }
  return v;
}
