import { z } from "zod";

// Things Harper found for the user that are not job postings: an event to
// attend, an article to read, or a social post worth a look. Job postings
// go to Jobs through save_job_posting instead.
export const CAREER_CONTENT_KINDS = ["event", "article", "post"] as const;
export type CareerContentKind = (typeof CAREER_CONTENT_KINDS)[number];
export const CAREER_CONTENT_VISIBLE_STATUSES = ["new", "seen", "opened"] as const;
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
  status: z.enum(["new", "seen", "opened", "dismissed", "removed"]),
  origin: z.enum(["user_request", "harper_offer", "harper_background"]),
  createdAt: z.string(),
});
export type CareerContentSuggestion = z.infer<
  typeof careerContentSuggestionSchema
>;
export type CareerContentReaction = "seen" | "opened" | "dismissed";

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
    status: row.status,
    origin: row.origin,
    createdAt: row.created_at,
  });
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
      ? `When: ${item.startsAt}${item.endsAt ? ` to ${item.endsAt}` : ""}`
      : "",
    item.location ? `Where: ${item.location}` : "",
    `Why it fits: ${item.reason}`,
    `Shown until: ${item.expiresAt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

