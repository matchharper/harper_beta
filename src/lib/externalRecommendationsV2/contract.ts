import { createHash } from "node:crypto";
import { z } from "zod";

export const EXPERIMENT = "external-recommendations-2026-10-v1";
export const PROMPT_VERSION = "external-fit-questions-v6-strong-constraints";
export const SEARCH_PLAN_VERSION = "external-search-v2-combined-title-v3";
export const providerSchema = z.enum(["openai", "jev"]);
export type FitProvider = z.infer<typeof providerSchema>;
export const providerModels = {
  openai: "gpt-6-luna",
  jev: "typesafe/jev-1.13",
} as const;
export function fitProvider(): FitProvider {
  return providerSchema.parse(process.env.EXTERNAL_FIT_V2_PROVIDER || "openai");
}
export function evaluatorKey(provider: FitProvider) {
  return `${PROMPT_VERSION}:${provider}:${providerModels[provider]}`;
}
export function fingerprint(value: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, stable(x)])
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}
// Same salted hash is used in the Python worker; unrelated Behavior cohorts are unchanged.
export function externalVariant(talentId: string): "control" | "v2" {
  return createHash("sha256")
    .update(`${EXPERIMENT}:${talentId.toLowerCase()}`)
    .digest()[0] < 128
    ? "control"
    : "v2";
}
const score = z.number().finite().min(0).max(100);
export const fitSchema = z.object({
  candidateInterest: score,
  companyInterest: score,
  mutualFit: score,
  roleFit: score,
  constraintPass: score,
  evidence: z.enum(["sufficient", "partial", "insufficient"]),
});
export type Fit = z.infer<typeof fitSchema>;
export type FitEvaluation = Fit & {
  roleId: string;
  raw: unknown;
  inputFingerprint: string;
  roleSourceHash: string;
  evaluatedAt: string;
  provider: FitProvider;
  model: string;
  promptVersion: string;
};
// Fit ordering uses only the model's fit signals. Salary shapes initial retrieval.
export function rankScore(fit: Fit) {
  const base =
    0.65 * fit.mutualFit +
    0.15 * fit.candidateInterest +
    0.1 * fit.companyInterest +
    0.1 * fit.roleFit;
  return fit.constraintPass <= 50
    ? base * 0.2 * (fit.constraintPass / 50) ** 2
    : base;
}
// Truncate, never round, only at the next LLM boundary; preserve stored precision.
export function scoreForLlm(value: number) {
  return Math.trunc(value * 10) / 10;
}
export function fitForLlm(value: unknown) {
  const fit = fitSchema.parse(value);
  return Object.fromEntries(
    Object.entries(fit).map(([key, v]) => [
      key,
      typeof v === "number" ? scoreForLlm(v) : v,
    ])
  );
}
// Control-cache scores have no V2 dimensions; do not invent missing evidence.
export const priorFitSchema = z.union([
  z.object({ legacyScore: score }).strict(),
  fitSchema,
]);
export function priorFitForLlm(value: unknown) {
  const legacy = z.object({ legacyScore: score }).strict().safeParse(value);
  return legacy.success
    ? { legacyScore: scoreForLlm(legacy.data.legacyScore) }
    : fitForLlm(value);
}
export function cachedFitEligible(fit: Fit) {
  return (
    fit.mutualFit >= 25 &&
    fit.constraintPass > 50 &&
    fit.candidateInterest >= 25
  );
}
export const planDecisionSchema = z.object({
  defaultAction: z.enum(["reuse", "explore", "replace"]),
  targetSalaryKrw: z.number().finite().positive().nullable(),
  plan: z.record(z.unknown()).nullable(),
});
export const workerSearchContextSchema = z.object({
  search_goal_seed: z.string().max(700),
  companion_actions: z.array(z.string().max(100)).max(8),
  search_history: z.array(z.string().max(2400)).max(4),
});
export type WorkerSearchContext = z.infer<typeof workerSearchContextSchema>;
export type SearchDefault = {
  revision: string;
  plan: import("./countries").V2SearchPlan;
  sql: string;
  titleVectors: number[][];
  contextFingerprint: string;
  targetSalaryKrw: number | null;
  version: string;
};
export function chunks<T>(items: T[], size = 10): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size)
  );
}
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const errors: unknown[] = [];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          results[i] = await fn(items[i], i);
        } catch (error) {
          errors.push(error);
        }
      }
    })
  );
  // Drain every batch before propagating failure so successful pair writes are never abandoned.
  if (errors.length)
    throw new AggregateError(errors, `${errors.length} batch(es) failed`);
  return results;
}
