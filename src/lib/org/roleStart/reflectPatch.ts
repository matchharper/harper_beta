import { levelOf, parseLevel, type RoleStartBrief } from "./brief";
import type { RawBrief } from "./questions";

type RawCriterion = RawBrief["criteria"][number];
type RawCondition = RawBrief["hardConditions"][number];
type Kind = RawCriterion["kind"];
type Years = { minYears: number | null; maxYears: number | null };

/** The answer_reflect output (buildReflectPatchSchema): only what the words change. */
export type ReflectOperation =
  | {
      type: "update_criterion";
      id: string;
      name: string | null;
      criteria: string | null;
      importance: string | null;
      kind: string | null;
      years: Years | null;
      evidenceTerms: string[][] | null;
    }
  | {
      type: "add_criterion";
      name: string;
      criteria: string;
      importance: string;
      kind: string;
      minYears: number | null;
      maxYears: number | null;
      evidenceTerms: string[][];
    }
  | { type: "remove_criterion"; id: string };

export type ReflectPatch = {
  operations: ReflectOperation[];
  hardConditions: RawCondition[] | null;
  otherNotes: string[] | null;
  appliedSummary: string;
};

const KINDS = ["rule", "similarity", "judgment"];
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isTerms = (value: unknown): value is string[][] =>
  Array.isArray(value) && value.every((group) => Array.isArray(group) && group.every((term) => typeof term === "string"));
const isYears = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value));

/** A criterion as the model would return it unchanged (signals left to briefFromRaw, which keeps them by id). */
function rawCriterion(criterion: RoleStartBrief["criteria"][number]): RawCriterion {
  return {
    id: criterion.id ?? null,
    name: criterion.name,
    criteria: criterion.criteria,
    importance: levelOf(criterion),
    kind: criterion.kind ?? "similarity",
    minYears: criterion.rule?.minYears ?? null,
    maxYears: criterion.rule?.maxYears ?? null,
    evidenceTerms: criterion.evidenceTerms ?? [],
  };
}

/** "other" conditions are left out: briefFromRaw keeps them from the previous Brief, as for a full rewrite. */
function rawConditions(brief: RoleStartBrief): RawCondition[] {
  return brief.hardConditions.flatMap((condition): RawCondition[] =>
    condition.kind === "other"
      ? []
      : [
          {
            kind: condition.kind,
            label: condition.label,
            years: "years" in condition ? condition.years : null,
            countries: condition.kind === "location" ? condition.countries : [],
            cities: condition.kind === "location" ? condition.cities : [],
            allowRelocation: condition.kind === "location" ? condition.allowRelocation : null,
          },
        ]
  );
}

/**
 * The full RawBrief the model would have returned for these changes, so
 * briefFromRaw applies them exactly like a whole-Brief rewrite (ids, change
 * history, signals kept only for unchanged text, summaryOf). The summary,
 * keywords and titles stay as they are. Anything it cannot place (an unknown
 * or repeated id, a missing field) is an error, never a guess.
 */
export function rawBriefFromPatch(
  brief: RoleStartBrief,
  patch: ReflectPatch
): { ok: true; raw: RawBrief } | { ok: false; error: string } {
  if (!patch || !Array.isArray(patch.operations)) return { ok: false, error: "no operations" };
  const updates = new Map<string, Extract<ReflectOperation, { type: "update_criterion" }>>();
  const removed = new Set<string>();
  const added: RawCriterion[] = [];
  const known = new Set(brief.criteria.map((criterion) => criterion.id));
  for (const [index, operation] of patch.operations.entries()) {
    const at = `operation ${index} (${operation?.type})`;
    if (operation?.type === "update_criterion" || operation?.type === "remove_criterion") {
      if (!known.has(operation.id)) return { ok: false, error: `${at}: unknown criterion id ${operation.id}` };
      if (updates.has(operation.id) || removed.has(operation.id)) return { ok: false, error: `${at}: criterion ${operation.id} changed twice` };
      if (operation.type === "remove_criterion") {
        removed.add(operation.id);
        continue;
      }
      const { name, criteria, importance, kind, years, evidenceTerms } = operation;
      if ((name !== null && !isText(name)) || (criteria !== null && !isText(criteria))) return { ok: false, error: `${at}: empty text` };
      if (importance !== null && !parseLevel(importance)) return { ok: false, error: `${at}: importance ${importance}` };
      if (kind !== null && !KINDS.includes(kind)) return { ok: false, error: `${at}: kind ${kind}` };
      if (years !== null && (typeof years !== "object" || !isYears(years.minYears) || !isYears(years.maxYears))) return { ok: false, error: `${at}: years` };
      if (evidenceTerms !== null && !isTerms(evidenceTerms)) return { ok: false, error: `${at}: evidenceTerms` };
      updates.set(operation.id, operation);
    } else if (operation?.type === "add_criterion") {
      const { name, criteria, importance, kind, minYears, maxYears, evidenceTerms } = operation;
      if (!isText(name) || !isText(criteria)) return { ok: false, error: `${at}: empty text` };
      if (!parseLevel(importance) || !KINDS.includes(kind)) return { ok: false, error: `${at}: importance or kind` };
      if (!isYears(minYears) || !isYears(maxYears) || !isTerms(evidenceTerms)) return { ok: false, error: `${at}: years or evidenceTerms` };
      added.push({ id: null, name, criteria, importance, kind: kind as Kind, minYears, maxYears, evidenceTerms });
    } else return { ok: false, error: `${at}: unknown operation` };
  }
  const criteria = [
    ...brief.criteria
      .filter((criterion) => !removed.has(criterion.id!))
      .map((criterion) => {
        const raw = rawCriterion(criterion);
        const update = updates.get(criterion.id!);
        if (!update) return raw;
        return {
          ...raw,
          ...(update.name !== null ? { name: update.name } : {}),
          ...(update.criteria !== null ? { criteria: update.criteria } : {}),
          ...(update.importance !== null ? { importance: update.importance } : {}),
          ...(update.kind !== null ? { kind: update.kind as Kind } : {}),
          ...(update.years !== null ? { minYears: update.years.minYears, maxYears: update.years.maxYears } : {}),
          ...(update.evidenceTerms !== null ? { evidenceTerms: update.evidenceTerms } : {}),
        };
      }),
    ...added,
  ];
  // briefFromRaw matches a criterion without an id by name: a new one under a kept name would merge into it.
  const names = criteria.map((criterion) => criterion.name.trim());
  if (new Set(names).size !== names.length) return { ok: false, error: "two criteria with the same name" };
  if (patch.hardConditions !== null && (!Array.isArray(patch.hardConditions) || !patch.hardConditions.every((item) => item && isText(item.label) && isText(item.kind))))
    return { ok: false, error: "hardConditions" };
  if (patch.otherNotes !== null && (!Array.isArray(patch.otherNotes) || !patch.otherNotes.every((line) => typeof line === "string")))
    return { ok: false, error: "otherNotes" };
  return {
    ok: true,
    raw: {
      summary: brief.summary,
      hardConditions: patch.hardConditions ?? rawConditions(brief),
      criteria,
      keywords: brief.keywords,
      matchingTitles: brief.titles?.matching ?? [],
      nearMissTitles: brief.titles?.nearMiss ?? [],
      otherNotes: patch.otherNotes ?? brief.otherNotes ?? [],
    },
  };
}
