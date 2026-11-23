/**
 * gtm agent: the purchased candidate DB (Shaun 11/23, public.candid). Which rows the DB channel takes, in which order,
 * and what it puts in for them. Pure: agent/dbSource.server.ts reads the table, resolves the MX records and inserts.
 *
 * The order (11/23): Korean people first (Harper's postings are mostly in Korea, and their mail is in Korean), then the
 * rest; within each, the table's primary key order (its ids are random uuids, so this is a stable shuffle). Not "most
 * recently updated": candid has no index on is_korean, email or last_updated_at, so that order needs a scan of all
 * 365K rows (about 380 ms and 47K pages, measured 11/23), and last_updated_at only spans the bulk refreshes of
 * Dec 2025 – Apr 2026. The key order reads a few thousand rows through the primary key. Each walk starts after the
 * last row it took (dbSource.server.ts), so a row it passed over is not read again, and it stops at an address whose
 * domain could not be checked, so a DNS hiccup never drops anyone.
 */
import { PERSONAL_MAIL_DOMAINS, isHarperMailAddress, mailDomain } from "../personalMail";
import { agentMailableAddress } from "./mailRules";
import { cleanEmail, personKey } from "./people";
import { PROFILE_TEXT_CHARS, pageExcerpt, profileTextFrom } from "./profile";
import { publicLinkedInProfile } from "./profileRead";
import { authorProfileUrl, personMemoryKeys } from "./signals";

// ---------------------------------------------------------------------------------------------------------------
// The address

/**
 * The rows worth reading (Postgres ~*, a pre-filter only; dbMailAddress decides): an address at a free personal mail
 * provider in the email column, plain or inside its JSON array. Built from the same list as agentMailableAddress.
 */
export const CANDID_ADDRESS_PATTERN = `@(${PERSONAL_MAIL_DOMAINS.map((domain) => domain.replace(/\./g, "\\.")).join("|")})($|[^a-z0-9.-])`;

/** Every address in candid.email: one plain address, or a JSON array of them as a string ('["a@x.com","b@y.com"]'). */
export function candidAddresses(value: string | null | undefined): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  let items: unknown[] | null = null;
  if (raw.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      // a broken array: read the addresses out of its text
    }
  }
  const words = items ? items.filter((item): item is string => typeof item === "string") : raw.split(/[\s,;[\]"']+/);
  const out: string[] = [];
  for (const word of words) {
    const email = cleanEmail(word);
    if (email && !out.includes(email)) out.push(email);
  }
  return out;
}

/** Mailboxes of a role, not a person (info@, recruit@, no-reply@ …). */
const ROLE_LOCAL = /^(admin|administrator|abuse|billing|careers?|contact|contactus|cs|help|helpdesk|hello|hiring|hr|info|jobs?|mail|mailer-daemon|marketing|media|news|newsletter|no-?reply|do-?not-?reply|office|postmaster|press|recruit(ing|ment)?|sales|security|service|support|team|webmaster)$/;
/** What a form or a scraper writes when there is no address (test@, your.email@, aaa@, 1234@ …). */
const PLACEHOLDER_LOCAL = /^(test|tester|testing|example|sample|dummy|fake|none|null|nil|na|abc|abcd|abcde|asdf|qwer|qwerty|user|username|name|yourname|your-?name|your\.?name|youremail|your-?email|your\.?email|myemail|my\.?email|email|e-?mail|id|me|aaa+|xxx+|0+|1234|12345|123456|1234567|123123)[0-9]*$/;

export function isRoleAddress(email: string): boolean {
  return ROLE_LOCAL.test(email.slice(0, email.lastIndexOf("@")).toLowerCase());
}

export function isPlaceholderAddress(email: string): boolean {
  const local = email.slice(0, email.lastIndexOf("@")).toLowerCase();
  return PLACEHOLDER_LOCAL.test(local) || /^(.)\1+$/.test(local);
}

/**
 * The address the agent may mail (mailRules.ts agentMailableAddress for an imported address: a free personal mailbox
 * only), the first such one of the row's; never Harper's own (a staff member's profile), a role mailbox or a
 * placeholder. Null when the row has none.
 */
export function dbMailAddress(value: string | null | undefined): string | null {
  return candidAddresses(value).find((email) => agentMailableAddress(email, "import") && !isHarperMailAddress(email)
    && !isRoleAddress(email) && !isPlaceholderAddress(email)) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// The domain's MX records

/** ok: the domain takes mail; none: it has no MX record (or does not exist); unknown: the lookup failed otherwise. */
export type MxVerdict = "ok" | "none" | "unknown";

/** The resolver's answers that mean the domain has no MX record (ENODATA) or no such domain (ENOTFOUND). */
const NO_RECORD_CODES = new Set(["ENODATA", "ENOTFOUND", "NODATA", "NOTFOUND"]);

/**
 * One domain's verdict from its MX lookup: records with a host (RFC 7505's null MX "." means it takes no mail), or
 * the error code. A timeout, a refused or failed server, or anything else is unknown, never none.
 */
export function mxVerdictOf(result: { records?: ReadonlyArray<{ exchange: string }> | null; errorCode?: string | null }): MxVerdict {
  if (result.records) return result.records.some((record) => record.exchange.trim() && record.exchange.trim() !== ".") ? "ok" : "none";
  return NO_RECORD_CODES.has(String(result.errorCode ?? "").toUpperCase()) ? "none" : "unknown";
}

/**
 * The call's verdicts, with "none" kept only when another domain resolved in the same call: a resolver that answers
 * "no such domain" for everything (no DNS at all, as in a sandbox) would otherwise drop gmail.com.
 */
export function settleMxVerdicts(verdicts: ReadonlyMap<string, MxVerdict>): Map<string, MxVerdict> {
  const anyOk = [...verdicts.values()].includes("ok");
  return new Map([...verdicts].map(([domain, verdict]) => [domain, verdict === "none" && !anyOk ? "unknown" : verdict]));
}

// ---------------------------------------------------------------------------------------------------------------
// The walk

/** One candid row as the walk reads it. */
export type CandidRow = {
  id: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  linkedinUrl: string | null;
  email: string | null;
  links: string[] | null;
  summary: string | null;
  bio: string | null;
};

/** A row with an address the agent may mail, and every key the person may be known by. */
export type DbCandidate = { row: CandidRow; email: string; profileUrl: string | null; contactUrl: string | null; personKey: string; keys: string[] };

/** A link of theirs on a known platform (their GitHub, a blog) as the page that stands for them; LinkedIn is the profile. */
export function candidContactUrl(links: readonly string[] | null | undefined): string | null {
  for (const link of links ?? []) {
    const raw = String(link ?? "").trim();
    if (!raw) continue;
    let author: string | null = null;
    try {
      author = authorProfileUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      author = null;
    }
    if (author && !/linkedin\.com/i.test(author)) return author;
  }
  return null;
}

/** The rows with an address the agent may mail (the others are passed over for good), in the walk's order. */
export function dbCandidates(rows: readonly CandidRow[]): DbCandidate[] {
  return rows.flatMap((row) => {
    const email = dbMailAddress(row.email);
    if (!email) return [];
    const profileUrl = publicLinkedInProfile(row.linkedinUrl);
    const contactUrl = candidContactUrl(row.links);
    const key = personKey({ email, profileUrl });
    if (!key) return [];
    return [{ row, email, profileUrl, contactUrl, personKey: key, keys: personMemoryKeys({ personKey: key, email, profileUrl, contactUrl }) }];
  });
}

export type DbPickSkips = { known: number; duplicate: number; noMx: number };

/**
 * The people to put in, in the walk's order, at most `room`: never someone the agent already has (`known`: any of
 * their keys), nor the same address twice, nor an address whose domain takes no mail. It stops at the first address
 * whose domain could not be checked (`stopped`), so the next walk, starting after the last row taken, reads it again.
 */
export function pickDbCandidates(candidates: readonly DbCandidate[], args: {
  room: number; known: ReadonlySet<string>; mx: ReadonlyMap<string, MxVerdict>;
}): { picked: DbCandidate[]; stopped: boolean; skipped: DbPickSkips } {
  const picked: DbCandidate[] = [];
  const skipped: DbPickSkips = { known: 0, duplicate: 0, noMx: 0 };
  const emails = new Set<string>();
  const room = Math.max(0, Math.floor(args.room));
  for (const candidate of candidates) {
    if (picked.length >= room) break;
    if (candidate.keys.some((key) => args.known.has(key))) { skipped.known += 1; continue; }
    if (emails.has(candidate.email)) { skipped.duplicate += 1; continue; }
    const verdict = args.mx.get(mailDomain(candidate.email)) ?? "unknown";
    if (verdict === "unknown") return { picked, stopped: true, skipped };
    if (verdict === "none") { skipped.noMx += 1; continue; }
    emails.add(candidate.email);
    picked.push(candidate);
  }
  return { picked, stopped: false, skipped };
}

// ---------------------------------------------------------------------------------------------------------------
// The profile text

export type CandidExperience = {
  company: string | null; role: string | null; description: string | null; months: number | null;
  startDate: string | null; endDate: string | null;
};
export type CandidEducation = { school: string | null; degree: string | null; field: string | null; startDate: string | null; endDate: string | null };

/** The parts' labels (profile.ts form: "<label>: <text>", one line each). */
export const DB_PROFILE_LABEL = {
  about: "Their profile in Harper's candidate database",
  experience: "Experience (newest first)",
  education: "Education",
} as const;

/** Each part's share of PROFILE_TEXT_CHARS, so a long career never pushes the education out. */
const ABOUT_CHARS = 1_200;
const EXPERIENCE_CHARS = 1_300;
const EDUCATION_CHARS = 350;
const EXPERIENCE_LINES = 8;
const EXPERIENCE_DESCRIPTION_CHARS = 220;
const EDUCATION_LINES = 3;

const oneLine = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").trim();
const month = (value: string | null | undefined) => (/^\d{4}-\d{2}/.test(String(value ?? "")) ? String(value).slice(0, 7) : null);
const year = (value: string | null | undefined) => (/^\d{4}/.test(String(value ?? "")) ? String(value).slice(0, 4) : null);
const clipAt = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Current roles first, then by start, newest first. */
export function experienceOrder(experiences: readonly CandidExperience[]): CandidExperience[] {
  const start = (item: CandidExperience) => Date.parse(String(item.startDate ?? "")) || 0;
  return [...experiences].sort((a, b) => Number(Boolean(a.endDate)) - Number(Boolean(b.endDate)) || start(b) - start(a));
}

/** Where they work now: the company of their latest role without an end date. */
export function dbCurrentCompany(experiences: readonly CandidExperience[]): string | null {
  const current = experienceOrder(experiences).find((item) => !item.endDate && oneLine(item.company));
  return current ? oneLine(current.company).slice(0, 200) : null;
}

/** "Company · Role · 26 months (2021-03 – 2023-05): what they did" */
function experienceLine(item: CandidExperience): string | null {
  const company = oneLine(item.company);
  const role = oneLine(item.role);
  if (!company && !role) return null;
  const from = month(item.startDate);
  const to = item.endDate ? month(item.endDate) : "present";
  const months = Number.isFinite(item.months) && Number(item.months) > 0 ? `${Number(item.months)} months` : null;
  const when = from ? `(${from} – ${to ?? "?"})` : null;
  const head = [company, role, [months, when].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  const description = pageExcerpt(item.description, EXPERIENCE_DESCRIPTION_CHARS * 2);
  return description ? `${head}: ${clipAt(description, EXPERIENCE_DESCRIPTION_CHARS)}` : head;
}

/** "School · Degree, Field (2015–2019)" */
function educationLine(item: CandidEducation): string | null {
  const school = oneLine(item.school);
  if (!school) return null;
  const study = [oneLine(item.degree), oneLine(item.field)].filter(Boolean).join(", ");
  const from = year(item.startDate);
  const to = year(item.endDate);
  const when = from || to ? `(${from ?? "?"}–${to ?? ""})` : null;
  return [[school, study].filter(Boolean).join(" · "), when].filter(Boolean).join(" ");
}

/** Lines joined with " | " up to `max` characters (whole lines only; the first one clipped when it alone is longer). */
function joinLines(lines: readonly string[], max: number): string {
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const add = line.length + (out.length ? 3 : 0);
    if (used + add > max) {
      if (!out.length) out.push(clipAt(line, max));
      break;
    }
    out.push(line);
    used += add;
  }
  return out.join(" | ");
}

/**
 * profile_text for a DB person, as the posting picker and the mail writer read it (profile.ts form, at most
 * PROFILE_TEXT_CHARS): their headline and summary (the bio after it when the summary does not hold it already), then
 * their experience, then their education. Contact details and links are taken out (profile.ts pageExcerpt).
 */
export function dbProfileText(row: Pick<CandidRow, "headline" | "summary" | "bio">, experiences: readonly CandidExperience[], educations: readonly CandidEducation[]): string | null {
  const headline = pageExcerpt(row.headline, 300);
  const summary = pageExcerpt(row.summary, ABOUT_CHARS * 2);
  const bio = pageExcerpt(row.bio, ABOUT_CHARS * 2);
  // A summary compiled from the profile often ends with "bio: …" already.
  const bioInSummary = Boolean(summary && bio && summary.includes(bio.slice(0, 60)));
  const about = [headline && !(summary ?? "").includes(headline) ? headline : null, summary, bioInSummary ? null : bio]
    .filter(Boolean).join(" · ");
  const work = experienceOrder(experiences).slice(0, EXPERIENCE_LINES).map(experienceLine).filter((line): line is string => Boolean(line));
  const school = educations.slice(0, EDUCATION_LINES).map(educationLine).filter((line): line is string => Boolean(line));
  return profileTextFrom([
    { label: DB_PROFILE_LABEL.about, text: about ? clipAt(about, ABOUT_CHARS) : null },
    { label: DB_PROFILE_LABEL.experience, text: joinLines(work, EXPERIENCE_CHARS) },
    { label: DB_PROFILE_LABEL.education, text: joinLines(school, EDUCATION_CHARS) },
  ], PROFILE_TEXT_CHARS);
}

/** source_ref of a candid row (unique on gtm_agent_people). */
export const candidSourceRef = (id: string) => `candid:${id}`;
