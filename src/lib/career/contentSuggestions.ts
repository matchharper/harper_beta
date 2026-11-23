import { z } from "zod";

// Things Harper found for the user that are not job postings: an event to
// attend, something to sign up for (fellowship, contest, course recruiting,
// coffee chat, mentoring), an article to read, or a social post worth a look.
// Job postings go to Jobs through save_job_posting instead.
export const CAREER_CONTENT_KINDS = [
  "event",
  "signup",
  "article",
  "post",
] as const;
export type CareerContentKind = (typeof CAREER_CONTENT_KINDS)[number];
export const CAREER_CONTENT_VISIBLE_STATUSES = [
  "new",
  "seen",
  "opened",
] as const;
export const CAREER_CONTENT_MAX_VISIBLE = 20;

export const careerContentSuggestionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(CAREER_CONTENT_KINDS),
  url: z.string(),
  title: z.string(),
  source: z.string().nullable(),
  reason: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  location: z.string().nullable(),
  publishedAt: z.string().nullable(),
  expiresAt: z.string(),
  deadline: z.string().nullable(),
  status: z.enum(["new", "seen", "opened", "dismissed", "removed"]),
  origin: z.enum(["user_request", "harper_offer", "harper_background"]),
  createdAt: z.string(),
});
export type CareerContentSuggestion = z.infer<
  typeof careerContentSuggestionSchema
>;
export type CareerContentReaction = "seen" | "opened" | "dismissed";

/** The status a reaction leads to, as manage_career_content_suggestion applies it;
 * null when it changes nothing. */
export function nextCareerContentStatus(
  item: Pick<CareerContentSuggestion, "status">,
  reaction: CareerContentReaction
): CareerContentSuggestion["status"] | null {
  const { status } = item;
  if (reaction === "seen") return status === "new" ? "seen" : null;
  if (reaction === "opened")
    return status === "new" || status === "seen" ? "opened" : null;
  return (CAREER_CONTENT_VISIBLE_STATUSES as readonly string[]).includes(status)
    ? "dismissed"
    : null;
}

export function readCareerContentSuggestionRow(
  row: Record<string, unknown>
): CareerContentSuggestion {
  return careerContentSuggestionSchema.parse({
    id: row.id,
    kind: row.kind,
    url: row.url,
    title: row.title,
    source: row.source ?? null,
    reason: row.reason,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    location: row.location ?? null,
    publishedAt: row.published_at ?? null,
    expiresAt: row.expires_at,
    deadline: row.deadline ?? null,
    status: row.status,
    origin: row.origin,
    createdAt: row.created_at,
  });
}

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An event whose page gives a date and no time is kept as whole UTC days: from 00:00Z of its first day to 00:00Z
 * after its last (careerContentDateOnly reads it back, so the card shows the date alone, never a made-up time).
 */
export function careerContentWholeDays(startDate: string, endDate?: string | null) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const last = endDate && DATE_ONLY.test(endDate) ? Date.parse(`${endDate}T00:00:00.000Z`) : start;
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(Math.max(start, Number.isFinite(last) ? last : start) + DAY_MS).toISOString(),
  };
}

/** Kept as whole UTC days (careerContentWholeDays): the event has a date and no time. */
export function careerContentDateOnly(item: Pick<CareerContentSuggestion, "startsAt" | "endsAt">) {
  const start = Date.parse(item.startsAt ?? "");
  const end = Date.parse(item.endsAt ?? "");
  return Number.isFinite(start) && Number.isFinite(end) && start % DAY_MS === 0 && end % DAY_MS === 0 && end > start;
}

export function isCareerContentSuggestionVisible(
  item: Pick<CareerContentSuggestion, "status" | "expiresAt">,
  now = Date.now()
) {
  return (
    (CAREER_CONTENT_VISIBLE_STATUSES as readonly string[]).includes(
      item.status
    ) && Date.parse(item.expiresAt) > now
  );
}

/** Events first by date, then the newest finds. */
export function sortCareerContentSuggestions(
  items: readonly CareerContentSuggestion[]
) {
  const eventTime = (item: CareerContentSuggestion) =>
    item.kind === "event" && item.startsAt ? Date.parse(item.startsAt) : null;
  return [...items].sort((a, b) => {
    const at = eventTime(a);
    const bt = eventTime(b);
    if (at !== null && bt !== null) return at - bt;
    if (at !== null) return -1;
    if (bt !== null) return 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export function formatCareerContentSuggestion(item: CareerContentSuggestion) {
  return [
    `Item ${item.id} · ${item.kind} · ${item.status}`,
    `Title: ${item.title}`,
    `URL: ${item.url}`,
    item.source ? `Source: ${item.source}` : "",
    item.startsAt
      ? careerContentDateOnly(item)
        ? `When: ${item.startsAt.slice(0, 10)} (date only, no time given)`
        : `When: ${item.startsAt}${item.endsAt ? ` to ${item.endsAt}` : ""}`
      : "",
    item.location ? `Where: ${item.location}` : "",
    item.deadline ? `Deadline: ${item.deadline}` : "",
    `Why it fits: ${item.reason}`,
    `Shown until: ${item.expiresAt}`,
  ]
    .filter(Boolean)
    .join("\n");
}
