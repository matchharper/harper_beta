import { ORG_TODO_SUGGESTIONS_SHOWN } from "./todo";

/**
 * Harper's own suggestions on a Role's To-do ("이거 할까요?"), written through
 * manage_todo_suggestions in the runs Harper starts itself. What to suggest,
 * when and in what words is Harper's judgment; the limits below are code.
 */
export const TODO_SUGGESTION_RULES = {
  /** Open (unanswered, unexpired) suggestions per Role, as many as the To-do shows. */
  openPerRole: ORG_TODO_SUGGESTIONS_SHOWN,
  /** A suggestion the team dismissed is not suggested again for this long. */
  dismissedMemoryDays: 14,
  expiresInDays: { min: 1, max: 7, default: 3 },
  titleMaxLength: 140,
  planMaxLength: 800,
  talentsMax: 5,
} as const;

export class TodoSuggestionInputError extends Error {}

const KIND = /^[a-z][a-z0-9_]{2,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i;
// Phone numbers (010-1234-5678, 01012345678, 02-123-4567, +82 10 1234 5678,
// (415) 555-0100), not dates such as 2026-11-09.
const PHONE =
  /\b01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}\b|\b0\d{1,2}[\s.-]\d{3,4}[\s.-]\d{4}\b|\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{3,4}[\s.-]?\d{4}\b|\(\d{3}\)\s?\d{3}[\s.-]\d{4}\b/;

/** Whether the text holds an email address or a phone number. */
export function containsContactDetails(value: string) {
  return EMAIL.test(value) || PHONE.test(value);
}

export type TodoSuggestionAdd = {
  kind: string;
  title: string;
  plan: string;
  talentIds: string[];
  expiresInDays: number;
};

function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim())
    throw new TodoSuggestionInputError(`${field} is required.`);
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length > max)
    throw new TodoSuggestionInputError(`${field} is ${cleaned.length} characters; keep it under ${max}.`);
  if (containsContactDetails(cleaned))
    throw new TodoSuggestionInputError(
      `${field} must not contain an email address or phone number. The To-do names candidates only as the company sees them.`
    );
  return cleaned;
}

/** Checks an add request. Throws TodoSuggestionInputError with a fixable message. */
export function parseTodoSuggestionAdd(input: Record<string, unknown>): TodoSuggestionAdd {
  const kind = typeof input.kind === "string" ? input.kind.trim() : "";
  if (!KIND.test(kind))
    throw new TodoSuggestionInputError(
      "kind must be a short lowercase label with underscores, 3–40 characters (for example follow_up_candidate)."
    );
  const rawTalents = input.talentIds ?? [];
  if (!Array.isArray(rawTalents))
    throw new TodoSuggestionInputError("talentIds must be a list of candidate IDs.");
  const talentIds = [...new Set(rawTalents.map((id) => String(id ?? "").trim()).filter(Boolean))].sort();
  if (talentIds.length > TODO_SUGGESTION_RULES.talentsMax)
    throw new TodoSuggestionInputError(`Name at most ${TODO_SUGGESTION_RULES.talentsMax} candidates in one suggestion.`);
  const invalid = talentIds.find((id) => !UUID.test(id));
  if (invalid) throw new TodoSuggestionInputError(`${invalid} is not a candidate ID from this Role's list.`);
  const { min, max } = TODO_SUGGESTION_RULES.expiresInDays;
  const days = input.expiresInDays === undefined || input.expiresInDays === null
    ? TODO_SUGGESTION_RULES.expiresInDays.default
    : Number(input.expiresInDays);
  if (!Number.isInteger(days) || days < min || days > max)
    throw new TodoSuggestionInputError(`expiresInDays must be a whole number from ${min} to ${max}.`);
  return {
    kind,
    title: text(input.title, "title", TODO_SUGGESTION_RULES.titleMaxLength),
    plan: text(input.plan, "plan", TODO_SUGGESTION_RULES.planMaxLength),
    talentIds,
    expiresInDays: days,
  };
}

/** Same suggestion: same kind about the same candidates. */
export function sameTodoSuggestion(
  a: { kind: string; talent_ids: string[] | null },
  b: { kind: string; talentIds: readonly string[] }
) {
  const left = [...(a.talent_ids ?? [])].sort();
  return a.kind === b.kind && left.length === b.talentIds.length && left.every((id, index) => id === b.talentIds[index]);
}

export type TodoSuggestionListRow = {
  id: string;
  kind: string;
  title: string;
  plan: string;
  status: string;
  talent_ids: string[] | null;
  source: string | null;
  expires_at: string;
  decided_at: string | null;
  created_at: string;
};

/** What Harper reads back from list: open ones, recent answers, muted kinds. */
export function formatTodoSuggestionList(args: {
  roleId: string;
  open: TodoSuggestionListRow[];
  answered: TodoSuggestionListRow[];
  /** Each kind the team stopped, with the wording they last saw for it. */
  muted: Array<{ kind: string; title: string | null }>;
}) {
  const line = (row: TodoSuggestionListRow, when: string) =>
    `- ${row.id} | ${row.kind} | ${when} | ${row.title}${row.talent_ids?.length ? ` | candidates ${row.talent_ids.join(", ")}` : ""}`;
  return [
    `Role ${args.roleId} To-do suggestions.`,
    `Open (${args.open.length} of at most ${TODO_SUGGESTION_RULES.openPerRole}):`,
    ...(args.open.length ? args.open.map((row) => line(row, `open until ${row.expires_at}`)) : ["- none"]),
    `Answered in the last ${TODO_SUGGESTION_RULES.dismissedMemoryDays} days:`,
    ...(args.answered.length
      ? args.answered.map((row) => line(row, `${row.status === "dismissed" ? "dismissed (not now)" : row.status} ${row.decided_at ?? row.created_at}`))
      : ["- none"]),
    "The team asked you to stop these; do not suggest the same thing again under this kind or another:",
    ...(args.muted.length
      ? args.muted.map((entry) => `- ${entry.kind}${entry.title ? ` | last suggested as: ${entry.title}` : ""}`)
      : ["- none"]),
  ].join("\n");
}
