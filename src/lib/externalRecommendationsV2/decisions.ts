import { recordDirectUsage } from "./usage";
import rubric from "./fitQuestions.v4.json";
import {
  fitSchema,
  providerModels,
  type Fit,
  type FitProvider,
} from "./contract";

const questions = rubric.questions;
export const COMMON_SCORING_INSTRUCTIONS = rubric.commonInstructions;

type Question = { type: string; instructions: string; criteria: unknown };
// Keep the rubric verbatim in shared input; questions bind only role and metric.
export const SHARED_METRIC_RUBRICS = Object.entries(questions).map(([metric, q]) => {
  const criteria = Array.isArray(q.criteria)
    ? q.criteria.map((text, index) => `${index}: ${text}`)
    : Object.entries(q.criteria).map(([value, text]) => `${value}: ${text}`);
  return `### Rubric ${metric}\n${q.instructions}\nCriteria:\n${criteria.join("\n")}`;
}).join("\n\n");

export function buildDecisionRequest(
  provider: FitProvider,
  input: string,
  roleIds: string[]
) {
  if (
    !roleIds.length ||
    roleIds.length > 10 ||
    new Set(roleIds).size !== roleIds.length
  )
    throw new Error("Decisions expects 1–10 unique roles");
  const sharedInstructions = `## Shared evaluation instructions (apply to every question)\n${COMMON_SCORING_INSTRUCTIONS}\nApply each named rubric in full, including all qualifications and exceptions, only to the role_id bound by the question. Other roles are independent evidence, never comparison anchors.\n## Shared metric rubrics\n${SHARED_METRIC_RUBRICS}`;
  const sharedInput = `${sharedInstructions}\n\n## Supplied evidence\n${input}`;
  const entries = roleIds.flatMap((id, index) =>
    Object.entries(questions).map(([metric, value]) => {
      const q = value as Question;
      const name = `r${index}_${metric}`;
      const instructions = `For role_id ${id}, apply shared instructions and Rubric ${metric}. ${q.type === "noul" ? "Estimate probability of its true criterion (false is the contrary event)." : q.type === "score" ? "Levels 0–4 use its ordered criteria." : "Choice values use its criteria."}`;
      return { name, metric, q, instructions };
    })
  );
  if (provider === "jev")
    return {
      model: providerModels.jev,
      state: { evidence: sharedInput },
      questions: Object.fromEntries(
        entries.map(({ name, metric, q, instructions }) => [
          name,
          {
            type: q.type,
            instructions,
            criteria: Array.isArray(q.criteria)
              ? q.criteria.map((_, i) => `Rubric ${metric}, criterion ${i} in the input.`)
              : Object.fromEntries(Object.keys(q.criteria as Record<string, string>).map(value =>
                  [value, `Rubric ${metric}, criterion ${value} in the input.`])),
          },
        ])
      ),
      provider: { allow_fallbacks: false, data_collection: "deny" },
    };
  return {
    model: providerModels.openai,
    input: [
      { role: "developer", content: sharedInstructions },
      { role: "user", content: input },
    ],
    questions: entries.map(({ name, q, instructions }) => {
      if (q.type === "noul") {
        return {
          name,
          type: "predicate",
          instructions,
        };
      }
      if (q.type === "score")
        return {
          name,
          type: "score",
          instructions,
          levels: (q.criteria as string[]).map((_, i) => ({ label: String(i) })),
        };
      return {
        name,
        type: "choice",
        instructions,
        choices: Object.keys(q.criteria as Record<string, string>).map(value => ({ value })),
      };
    }),
  };
}
export function parseDecisionBatch(
  provider: FitProvider,
  raw: any,
  roleIds: string[]
) {
  const entries: Array<[string, any]> =
    provider === "openai"
      ? (Array.isArray(raw?.answers) ? raw.answers : []).map((a: any) => [
          a.name,
          a,
        ])
      : Object.entries(raw?.answers ?? {});
  const answers = new Map<string, any>();
  const duplicates = new Set<string>();
  for (const [name, answer] of entries) {
    if (answers.has(name)) duplicates.add(name);
    answers.set(name, answer);
  }
  const evaluations: Array<{ roleId: string; fit: Fit; raw: unknown }> = [];
  const errors: string[] = [];
  const invalid: Array<{ roleId: string; raw: unknown; error: string }> = [];
  roleIds.forEach((roleId, i) => {
    const row: Record<string, any> = {};
    const original: Record<string, any> = {};
    for (const metric of Object.keys(questions)) {
      const a: any = answers.get(`r${i}_${metric}`);
      original[metric] = a;
      if (!a || a.type === "refusal" || duplicates.has(`r${i}_${metric}`))
        continue;
      row[metric] =
        metric === "evidence"
          ? a.choice
          : ["mutualFit", "roleFit"].includes(metric)
            ? typeof a.score === "number"
              ? a.score * 25
              : undefined
            : typeof (provider === "openai" ? a.probability : a.noul) ===
                "number"
              ? (provider === "openai" ? a.probability : a.noul) * 100
              : undefined;
    }
    const result = fitSchema.safeParse(row);
    if (result.success)
      evaluations.push({ roleId, fit: result.data, raw: original });
    else {
      errors.push(roleId);
      invalid.push({
        roleId,
        raw: original,
        error: "Invalid or incomplete metric contract",
      });
    }
  });
  return { evaluations, errors, invalid };
}
export async function callDecisions(
  provider: FitProvider,
  input: string,
  roleIds: string[],
  signal?: AbortSignal
) {
  const key =
    process.env[
      provider === "openai" ? "OPENAI_API_KEY" : "OPENROUTER_API_KEY"
    ];
  if (!key) throw new Error(`Missing ${provider} scoring credential`);
  const started = Date.now();
  let raw: any;
  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    try {
      const timeout = AbortSignal.timeout(30_000);
      const response = await fetch(
        provider === "openai"
          ? "https://api.openai.com/v1/decisions"
          : "https://openrouter.ai/api/alpha/decisions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildDecisionRequest(provider, input, roleIds)),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        }
      );
      if (!response.ok) {
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        await response.body?.cancel();
        if (retryable && attempts < 2) {
          const seconds = Number(response.headers.get("retry-after") ?? 0.25);
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Number.isFinite(seconds)
                ? Math.max(250, Math.min(5000, seconds * 1000))
                : 250
            )
          );
          continue;
        }
        throw Object.assign(
          new Error(`Decisions ${provider} HTTP ${response.status}`),
          { attempts }
        );
      }
      raw = await response.json();
      break;
    } catch (error) {
      signal?.throwIfAborted();
      const transient =
        error instanceof TypeError ||
        (error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name));
      if (transient && attempts < 2) continue;
      throw Object.assign(
        error instanceof Error ? error : new Error("Decisions request failed"),
        { attempts }
      );
    }
  }
  await recordDirectUsage(
    provider === "openai" ? "openai_decisions" : "jev_decisions",
    providerModels[provider],
    raw.usage,
    Date.now() - started
  );
  const parsed = parseDecisionBatch(provider, raw, roleIds);
  return {
    ...parsed,
    attempts,
    unknownCostAttempts: attempts - 1,
    elapsedMs: Date.now() - started,
    usage: raw.usage ?? null,
    model: raw.model ?? providerModels[provider],
  };
}
