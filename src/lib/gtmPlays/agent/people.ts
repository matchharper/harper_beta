/**
 * #5: who a person is across sources, and whom the agent never contacts. Pure (no imports but types), so the
 * import, the run and the tests apply the same rules.
 */
import type { AgentEvent, AgentEventKind, AgentExcludeReason, AgentMethod } from "./types";

/** Posts older than this are not a signal any more (Chris's rule: last 14 days only). */
export const SIGNAL_MAX_AGE_DAYS = 14;
/** A #4 or #5 mail to the same person within this many days: no #5 mail (per person, whatever the Role). */
export const RECENT_CONTACT_DAYS = 30;

const DAY_MS = 86_400_000;

/** A lower-cased address, or null when it is not one. */
export function cleanEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "").trim().toLowerCase().replace(/^mailto:/, "");
  return /^[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}$/.test(email) ? email : null;
}

/** A profile URL without scheme, "www.", query, fragment or trailing slash (linkedin.com/in/jane-doe). */
export function cleanProfileUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const url = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^(www\.|[a-z]{2}\.)(?=linkedin\.com)/, "")
    .replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}\/\S+$/.test(url) ? url : null;
}

/**
 * One key per person: the email when there is one, else the profile URL. Null when there is neither (such a person
 * cannot be told apart and is not kept).
 */
export function personKey(input: { email?: string | null; profileUrl?: string | null }): string | null {
  const email = cleanEmail(input.email);
  if (email) return `email:${email}`;
  const url = cleanProfileUrl(input.profileUrl);
  return url ? `url:${url}` : null;
}

/** Every key a person may be known by (both, when the import has the email and the profile). */
export function personKeys(input: { email?: string | null; profileUrl?: string | null }): string[] {
  const email = cleanEmail(input.email);
  const url = cleanProfileUrl(input.profileUrl);
  return [email ? `email:${email}` : null, url ? `url:${url}` : null].filter((key): key is string => Boolean(key));
}

/** What the run knows about a person's history before deciding whether to contact them. */
export type ExclusionFacts = {
  method: AgentMethod;
  email: string | null;
  signalAt: string | null;
  /** A Harper account with this email or profile. */
  isMember: boolean;
  /** On the shared opt-out / bounce / complaint list. */
  isSuppressed: boolean;
  /** Harper staff or a test address. */
  isInternal: boolean;
  /** Latest #4 / #5 mail sent to this person (any Role). */
  lastMailedAt: string | null;
  /** Latest time a #5 cycle for this person ended without a reaction. */
  lastEndedAt: string | null;
  /** The same person already handled earlier in this run. */
  seenInRun: boolean;
  /** How many days old a post may be for its source (the source's tuning; 14 by default). */
  maxAgeDays?: number;
  /** The post reads as a recruiter, a company account, or no clear intent to move (decided upstream). */
  notJobSeeking?: boolean;
};

/** The first reason not to contact the person, or null to go on. Order: cheapest and most certain first. */
export function exclusionReason(facts: ExclusionFacts, now: Date, quietDaysAfterEnd: number): AgentExcludeReason | null {
  if (facts.seenInRun) return "duplicate";
  if (facts.isInternal) return "internal";
  if (facts.isSuppressed) return "suppressed";
  if (facts.isMember) return "member";
  if (facts.lastMailedAt && now.getTime() - Date.parse(facts.lastMailedAt) < RECENT_CONTACT_DAYS * DAY_MS) {
    return "recent_contact";
  }
  if (facts.lastEndedAt && now.getTime() - Date.parse(facts.lastEndedAt) < quietDaysAfterEnd * DAY_MS) {
    return "quiet_after_end";
  }
  // Applicants are a signal by applying; posts and profiles must be recent (the source's own window).
  if (facts.method !== "applicant") {
    const maxAge = facts.maxAgeDays ?? SIGNAL_MAX_AGE_DAYS;
    if (!facts.signalAt || now.getTime() - Date.parse(facts.signalAt) > maxAge * DAY_MS) return "stale_signal";
  }
  if (facts.notJobSeeking) return "not_job_seeking";
  return null;
}

/** The timeline with one more line (oldest first). */
export function withEvent(events: readonly AgentEvent[] | null | undefined, kind: AgentEventKind, by: string, note?: string | null, at = new Date()): AgentEvent[] {
  return [...(events ?? []), { at: at.toISOString(), kind, by, ...(note ? { note } : {}) }];
}

/** Korea-time hour (0-23) and day (YYYY-MM-DD) of a moment. */
export function kstClock(at: Date): { hour: number; day: string } {
  const kst = new Date(at.getTime() + 9 * 3_600_000);
  return { hour: kst.getUTCHours(), day: kst.toISOString().slice(0, 10) };
}

/** Whether a mail may go out now: Korea-time hour within [start, end). */
export function withinSendHours(at: Date, startHour: number, endHour: number): boolean {
  const { hour } = kstClock(at);
  return startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}

/**
 * Where a person whose page we only know by URL was found (a Role run's external or scraped people), until the
 * per-domain source list (agent/sources.ts) decides it: the platform of the profile URL, else "other".
 */
export function sourceOfProfileUrl(url: string | null | undefined): string {
  const host = String(url ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "");
  if (!host) return "other";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host === "threads.net" || host === "threads.com") return "threads";
  if (host === "github.com" || host.endsWith(".github.io")) return "github";
  return "other";
}

/** A run's counts after one more tick: every number adds up (spend in dollars to the millionth). */
export function sumCounts(current: Record<string, number>, added: Record<string, number>): Record<string, number> {
  const next = { ...current };
  for (const [key, value] of Object.entries(added)) {
    const sum = Number(next[key] ?? 0) + Number(value ?? 0);
    next[key] = Math.round(sum * 1_000_000) / 1_000_000;
  }
  return next;
}
