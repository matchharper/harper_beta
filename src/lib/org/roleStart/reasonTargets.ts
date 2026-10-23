import "server-only";

import type { RoleStartBrief } from "./brief";
import { callRoleStartJson, ROLE_START_FAST_MODEL, type RoleStartLlmUsage } from "./llm";
import type { RoleStartEvaluation, RoleStartSession } from "./session";

/**
 * What a "맞지 않음" rating was about: the criteria and conditions the team's
 * own reasons point at. Only those may change the Brief or push look-alikes
 * down; a rating with no reason, or a reason about something else, changes
 * nothing about the open point.
 */

/** Points at years (a years condition or a years criterion) rather than one criterion. */
export const YEARS_TARGET = "years";

type Ask = typeof callRoleStartJson;

function yearsIds(brief: RoleStartBrief) {
  return new Set([
    ...brief.hardConditions.filter((item) => item.kind === "min_years" || item.kind === "max_years").map((item) => item.id),
    ...brief.criteria.filter((item) => item.kind === "rule").map((item) => item.id ?? item.name),
  ]);
}

/**
 * What the team said in its own words: the typed reason plus any picked chip
 * for a reason the Brief does not cover, which is handled exactly like typing it.
 */
export function typedReason(evaluation: Pick<RoleStartEvaluation, "reasons" | "reasonText">) {
  const outside = (evaluation.reasons ?? []).filter((reason) => reason.scope === "outside").map((reason) => reason.label);
  return [...outside, (evaluation.reasonText ?? "").trim()].filter(Boolean).join("; ");
}

/** Targets named by the picked reason chips (each chip carries the id it is about). */
export function chipTargets(evaluation: RoleStartEvaluation, brief: RoleStartBrief) {
  const years = yearsIds(brief);
  const known = new Set([...brief.criteria.map((item) => item.id ?? item.name), ...brief.hardConditions.map((item) => item.id)]);
  const targets = new Set<string>();
  for (const reason of evaluation.reasons ?? []) {
    if (reason.scope || !known.has(reason.criterionId)) continue;
    targets.add(reason.criterionId);
    if (years.has(reason.criterionId)) targets.add(YEARS_TARGET);
  }
  return targets;
}

const CLASSIFY_SYSTEM = `A hiring team rated a candidate "맞지 않음" (not a fit) and wrote why. Decide which of the listed points the reason is about.
Return every point the reason clearly names or describes (by meaning, not just wording). Use "years" when it is about the amount of experience. Return [] when it is about none of them (e.g. salary, personality, something unrelated) or too vague to tell.`;

/** Typed reasons only: one short classification over this Brief's points. */
export async function classifyTypedReason(args: {
  text: string;
  brief: RoleStartBrief;
  ask?: Ask;
}): Promise<{ targets: Set<string>; usage: RoleStartLlmUsage }> {
  const points = [
    ...args.brief.criteria.map((item) => ({ id: item.id ?? item.name, about: `${item.name}: ${item.criteria}` })),
    ...args.brief.hardConditions.map((item) => ({ id: item.id, about: item.label })),
  ];
  const ids = [...points.map((item) => item.id), YEARS_TARGET];
  const ask = args.ask ?? callRoleStartJson;
  const { data, usage } = await ask<{ about: string[] }>({
    label: "reason_target",
    model: ROLE_START_FAST_MODEL,
    reasoningEffort: "low",
    maxOutputTokens: 300,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["about"],
      properties: { about: { type: "array", items: { type: "string", enum: ids } } },
    },
    system: CLASSIFY_SYSTEM,
    user: JSON.stringify({ reason: args.text.slice(0, 1_000), points }),
  });
  const targets = new Set((data.about ?? []).filter((id) => ids.includes(id)));
  const years = yearsIds(args.brief);
  if ([...targets].some((id) => years.has(id))) targets.add(YEARS_TARGET);
  return { targets, usage };
}

/**
 * For each "맞지 않음" among the first three: what its reasons point at.
 * Chips decide when there are any; a typed reason alone is classified once.
 */
export async function reasonTargetsByCandidate(
  session: RoleStartSession,
  brief: RoleStartBrief,
  ask?: Ask
): Promise<{ targets: Map<string, Set<string>>; usage: RoleStartLlmUsage[] }> {
  const targets = new Map<string, Set<string>>();
  const usage: RoleStartLlmUsage[] = [];
  for (const candidate of session.firstCandidates) {
    const evaluation = session.evaluations[candidate.talentId];
    if (!evaluation || evaluation.rating !== "bad") continue;
    let found = chipTargets(evaluation, brief);
    const typed = typedReason(evaluation);
    if (!found.size && typed) {
      const result = await classifyTypedReason({ text: typed, brief, ask }).catch(() => null);
      if (result) {
        found = result.targets;
        usage.push(result.usage);
      }
    }
    targets.set(candidate.talentId, found);
  }
  return { targets, usage };
}
