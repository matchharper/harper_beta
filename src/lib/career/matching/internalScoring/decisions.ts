import { setTimeout as delay } from "node:timers/promises";
import contract from "./workerContract.json";
import { evaluationText, type Row } from "./evidence";
import { tracedLlmFetch } from "@/lib/llm/providerTrace";
export type Stage = 1 | 2;
export type Criterion = {
  name?: string;
  criteria?: string;
  criterionDefinition?: string;
};
export { contract as internalScoringContract };

/** Same payload as company_requested_decisions.build_request; no model fallback. */
export function buildRequest(
  stage: Stage,
  input: string,
  criteria: Criterion[] = []
) {
  const questions: Row[] =
    stage === 1
      ? Object.entries(contract.SCREEN_QUESTIONS).map(
          ([name, instructions]) => ({
            name,
            type: "choice",
            instructions,
            choices: [
              {
                value: "continue",
                description:
                  "Default: retain for stage two, including plausible fit, incomplete evidence or unresolved conditions.",
              },
              {
                value: "exclude",
                description:
                  "Affirmative facts establish an obvious incompatibility on this axis; further assessment is unnecessary.",
              },
            ].map((choice) => ({
              ...choice,
              description:
                (contract.SCREEN_CHOICES as Row)[name]?.[choice.value] ??
                choice.description,
            })),
          })
        )
      : Object.entries(contract.SCORE_RUBRICS).map(([name, instructions]) => ({
          name,
          type: "score",
          instructions,
          levels: contract.LEVELS,
        }));
  if (stage === 2)
    questions.push(
      ...criteria.map((item, index) => ({
        name: `criterion_${index}`,
        type: "score",
        levels: contract.LEVELS,
        instructions: `Assess only shared criterion ${index + 1} (${item.name ?? ""}) using the candidate's own evidence. Preserve required/preferred importance. Missing evidence is uncertainty, not a known failure.`,
      }))
    );
  const evidence =
    input +
    (stage === 2 && criteria.length
      ? "\n\n## Current criteria — original definitions\n" +
        criteria
          .map(
            (item, index) =>
              `Criterion ${index + 1}: ${item.name ?? ""}\n${item.criteria ?? item.criterionDefinition ?? ""}`
          )
          .join("\n\n")
      : "");
  return {
    model: contract.MODEL,
    input: [
      {
        role: "developer",
        content:
          stage === 1
            ? contract.SCREEN_POLICY
            : contract.POLICY + "\n\n" + contract.SCORE_QUESTION_POLICY,
      },
      { role: "user", content: evidence },
    ],
    questions,
  };
}
export function parseAssessment(
  stage: Stage,
  raw: Row,
  criteria: Criterion[] = []
): Row {
  if (!Array.isArray(raw?.answers))
    throw new Error("Decisions response requires answers");
  const answers = new Map<string, Row>();
  for (const answer of raw.answers) {
    if (!answer || typeof answer.name !== "string")
      throw new Error("Decisions answer identity is invalid");
    if (answers.has(answer.name) || answer.type === "refusal")
      throw new Error("Decisions refused or duplicated an answer");
    answers.set(answer.name, answer);
  }
  const expected =
    stage === 1
      ? Object.keys(contract.SCREEN_QUESTIONS)
      : [
          "candidateFit",
          "companyFit",
          "mutualFit",
          ...criteria.map((_, i) => `criterion_${i}`),
        ];
  if (answers.size !== expected.length || expected.some((k) => !answers.has(k)))
    throw new Error("Decisions answer coverage does not match questions");
  if (stage === 1) {
    const decisions: Row = {};
    for (const name of expected) {
      const answer = answers.get(name)!;
      if (
        answer.type !== "choice" ||
        !["continue", "exclude"].includes(answer.choice)
      )
        throw new Error("invalid screen decision");
      decisions[name] = answer.choice;
    }
    const proceed = Object.values(decisions).every((v) => v === "continue");
    return {
      proceedToStage2: proceed,
      decision: proceed ? "continue" : "exclude",
      ...decisions,
      practicalScreen: [
        decisions.companyPracticalScreen,
        decisions.candidatePracticalScreen,
      ].includes("exclude")
        ? "exclude"
        : "continue",
    };
  }
  const score = (name: string) => {
    const a = answers.get(name)!;
    if (
      a.type !== "score" ||
      typeof a.score !== "number" ||
      !Number.isFinite(a.score) ||
      a.score < 0 ||
      a.score > 4
    )
      throw new Error(`invalid score for ${name}`);
    return a.score * 25;
  };
  const rows = criteria.map((item, index) => {
    const name = `criterion_${index}`,
      levels = answers.get(name)!.probabilities;
    if (!Array.isArray(levels) || levels.length !== contract.LEVELS.length)
      throw new Error(`incomplete score probabilities for ${name}`);
    const values = new Set<number>();
    const distribution = levels
      .map((level: Row) => {
        const value = level?.value,
          probability = level?.probability;
        if (
          !Number.isInteger(value) ||
          value < 0 ||
          value >= contract.LEVELS.length ||
          values.has(value) ||
          typeof probability !== "number" ||
          !Number.isFinite(probability) ||
          probability < 0 ||
          probability > 1
        )
          throw new Error("invalid score probability");
        values.add(value);
        return { value, label: contract.LEVELS[value].label, probability };
      })
      .sort((a, b) => a.value - b.value);
    return {
      name: item.name ?? "",
      criterionDefinition: item.criteria ?? item.criterionDefinition ?? "",
      score: score(name),
      distribution,
      label: distribution.reduce((a, b) =>
        b.probability > a.probability ? b : a
      ).label,
    };
  });
  return {
    candidateFit: score("candidateFit"),
    companyFit: score("companyFit"),
    mutualFit: score("mutualFit"),
    criteria: rows,
  };
}
export async function evaluateStage(
  source: Row,
  stage: Stage,
  options: {
    signal?: AbortSignal;
    now?: Date;
    fetch?: typeof fetch;
    apiKey?: string;
    onCall?: (trace: Row) => void;
    wait?: (ms: number) => Promise<unknown>;
  } = {}
) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OpenAI scoring credential");
  const payload = buildRequest(
    stage,
    evaluationText(source, stage, options.now),
    source.role.criteria ?? []
  );
  const started = Date.now(),
    parts: Row[] = [],
    wait =
      options.wait ??
      ((ms) => delay(ms, undefined, { signal: options.signal }));
  for (
    let offset = 0;
    offset < payload.questions.length;
    offset += contract.MAX_REQUEST_QUESTIONS
  ) {
    const request = {
      ...payload,
      questions: payload.questions.slice(
        offset,
        offset + contract.MAX_REQUEST_QUESTIONS
      ),
    };
    const began = Date.now();
    for (let attempt = 1; attempt <= 3; attempt++) {
      options.signal?.throwIfAborted();
      let response: Response;
      try {
        response = await (options.fetch ?? tracedLlmFetch)(contract.ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(90_000)])
            : AbortSignal.timeout(90_000),
        });
      } catch (error) {
        options.onCall?.({
          stage,
          request,
          attempts: attempt,
          error: String(error),
          elapsedMs: Date.now() - began,
        });
        options.signal?.throwIfAborted();
        if (attempt === 3) throw error;
        await wait(1000 * 2 ** (attempt - 1));
        continue;
      }
      if (!response.ok) {
        options.onCall?.({
          stage,
          request,
          attempts: attempt,
          status: response.status,
          raw: await response.text(),
          elapsedMs: Date.now() - began,
        });
        if (
          ([408, 429].includes(response.status) || response.status >= 500) &&
          attempt < 3
        ) {
          const retry = Number(
            response.headers.get("retry-after") ?? 2 ** (attempt - 1)
          );
          await wait(
            1000 *
              Math.max(
                0.25,
                Math.min(
                  Number.isFinite(retry) ? retry : 2 ** (attempt - 1),
                  30
                )
              )
          );
          continue;
        }
        throw new Error(`Decisions HTTP ${response.status}`);
      }
      const raw = await response.json();
      const expected = new Set(request.questions.map((q) => q.name));
      if (
        !Array.isArray(raw?.answers) ||
        raw.answers.length !== expected.size ||
        new Set(raw.answers.map((a: Row) => a?.name)).size !== expected.size ||
        raw.answers.some((a: Row) => !expected.has(a?.name))
      ) {
        options.onCall?.({
          stage,
          request,
          raw,
          attempts: attempt,
          elapsedMs: Date.now() - began,
          error: "Decisions chunk answer coverage mismatch",
        });
        throw new Error("Decisions chunk answer coverage mismatch");
      }
      parts.push({
        request,
        raw,
        attempts: attempt,
        elapsedMs: Date.now() - began,
      });
      break;
    }
  }
  let raw = parts[0].raw;
  if (parts.length > 1) {
    const usage: Row = {};
    for (const p of parts)
      for (const [key, value] of Object.entries(p.raw.usage ?? {})) {
        if (typeof value === "number") usage[key] = (usage[key] ?? 0) + value;
        else if (value && typeof value === "object")
          for (const [field, count] of Object.entries(value))
            if (typeof count === "number") {
              usage[key] ??= {};
              usage[key][field] = (usage[key][field] ?? 0) + count;
            }
      }
    raw = {
      model: raw.model ?? contract.MODEL,
      usage,
      answers: parts.flatMap((p) => p.raw.answers),
    };
  }
  let assessment: Row;
  try {
    assessment = parseAssessment(stage, raw, source.role.criteria ?? []);
  } catch (error) {
    options.onCall?.({
      stage,
      request: payload,
      raw,
      requests: parts,
      error: String(error),
      elapsedMs: Date.now() - started,
    });
    throw error;
  }
  const result = {
    assessment,
    model: raw.model ?? contract.MODEL,
    usage: raw.usage ?? {},
    elapsedMs: Date.now() - started,
    attempts: parts.reduce((n, p) => n + p.attempts, 0),
    requestCount: parts.length,
    raw,
  };
  options.onCall?.({
    stage,
    request: payload,
    ...result,
    ...(parts.length > 1 ? { requests: parts } : {}),
  });
  return result;
}
