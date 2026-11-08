import { normalizeOrgRoleCriteria } from "@/lib/org/roleCriteria";

/** Most tags one decision keeps (the record keeps the same number). */
export const ORG_REASON_TAG_LIMIT = 20;
const TAG_MAX_LENGTH = 200;

/** The key a criterion is tagged by: its id, or its name for older criteria. */
export function criterionReasonTag(criterion: {
  id?: string | null;
  name?: string | null;
}) {
  return (
    String(criterion.id ?? "").trim() || String(criterion.name ?? "").trim()
  );
}

/** Reasons that fit any Role; their names are COMPANY_TERMS.reasonTag. */
export const FIXED_REASON_TAGS = [
  "experience_skills",
  "role_fit",
  "working_conditions",
  "timing",
] as const;

export type FixedReasonTag = (typeof FIXED_REASON_TAGS)[number];

/**
 * The reason tags a decision on this Role may carry: the Role's criteria
 * keys, then the fixed categories. This is the one place that decides the set.
 */
export function allowedReasonTags(role: { criteria: unknown }): string[] {
  return [
    ...new Set([
      ...normalizeOrgRoleCriteria(role.criteria)
        .map(criterionReasonTag)
        .filter(Boolean),
      ...FIXED_REASON_TAGS,
    ]),
  ];
}

/** Trimmed, without blanks or repeats, in the given order. */
export function normalizeReasonTags(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError("reasonTags must be a list");
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new TypeError("reasonTags must be text");
    const tag = item.trim().slice(0, TAG_MAX_LENGTH);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > ORG_REASON_TAG_LIMIT)
    throw new RangeError(`reasonTags allows at most ${ORG_REASON_TAG_LIMIT}`);
  return tags;
}

/** Tags that are not in the allowed set, in order. */
export function unknownReasonTags(tags: string[], allowed: string[]) {
  const known = new Set(allowed);
  return tags.filter((tag) => !known.has(tag));
}
