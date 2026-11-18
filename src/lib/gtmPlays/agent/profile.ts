/**
 * #5: a person's profile text (gtm_agent_people.profile_text), what the posting picker, the mail writer and the email
 * lookup read about them. It is labelled, so they read a clean summary first and the details after, and know where
 * each part came from: "Summary from their own page: …" (2-5 factual sentences the search judge wrote about this
 * person only, from the page it read), "From their linked profile (github.com): …" (a page of theirs read later),
 * then "Their page (excerpt): …" (the page itself, cleaned). Rows from before keep the page's raw text (or an
 * applicant file's columns) and are read as they are. Pure.
 */
import { profileColumnText } from "./importRows";
import { mailPlainText, withoutLinks } from "./mailRules";

/** The most profile_text holds (summaries and the excerpt together). */
export const PROFILE_TEXT_CHARS = 3_000;
/** The most one summary holds (the judge's background, or what a later read of their pages added). */
export const SUMMARY_CHARS = 900;

export const PROFILE_LABEL = {
  summary: "Summary from their own page",
  excerpt: "Their page (excerpt)",
  linkedinSummary: "Summary from their public LinkedIn profile",
  linkedinExcerpt: "Their public LinkedIn profile (excerpt)",
  file: "From their application file",
  /** Their own pages read later (a blog's about page, GitHub, a portfolio, their LinkedIn profile). */
  ownPages: (hosts: string) => `From their own pages (${hosts})`,
  /** A profile a search found and the agent confirmed as theirs (agent/profileRead.ts). */
  linked: (host: string) => `From their linked profile (${host})`,
} as const;

export type ProfilePart = { label: string; text: string | null | undefined };

/**
 * A summary as kept: plain words on one line (no links, web or email addresses, phone numbers or markup), at most
 * `max` characters, cut at a sentence end when there is one; null when nothing is left.
 */
export function cleanSummary(value: string | null | undefined, max = SUMMARY_CHARS): string | null {
  const plain = mailPlainText(profileColumnText(String(value ?? "")), max * 2).replace(/\s+/g, " ").trim();
  if (!plain) return null;
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return (end > max / 2 ? cut.slice(0, end + 1) : cut).trim();
}

/**
 * A page's text as an excerpt: markdown images and HTML out, links as their words, web and email addresses and
 * phone numbers out, blank runs collapsed; null when nothing is left.
 */
export function pageExcerpt(text: string | null | undefined, max = PROFILE_TEXT_CHARS): string | null {
  const plain = profileColumnText(withoutLinks(String(text ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ")))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return plain || null;
}

/**
 * profile_text from labelled parts, in order ("<label>: <text>" lines; empty parts left out), at most
 * PROFILE_TEXT_CHARS: the last part (the excerpt) takes what room is left; null when every part is empty.
 */
export function profileTextFrom(parts: readonly ProfilePart[], max = PROFILE_TEXT_CHARS): string | null {
  const lines: string[] = [];
  let used = 0;
  for (const part of parts) {
    const text = String(part.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const room = max - used - (lines.length ? 1 : 0) - part.label.length - 2;
    if (room < 40) break;
    const line = `${part.label}: ${text.length > room ? text.slice(0, room).trim() : text}`;
    lines.push(line);
    used += line.length + (lines.length > 1 ? 1 : 0);
  }
  return lines.length ? lines.join("\n") : null;
}

const LABELS = [
  PROFILE_LABEL.summary, PROFILE_LABEL.excerpt, PROFILE_LABEL.linkedinSummary, PROFILE_LABEL.linkedinExcerpt, PROFILE_LABEL.file,
  "From their own pages (", "From their linked profile (",
];

/** Whether profile_text is in the labelled form (rows from before hold a page's raw text or a file's columns). */
export function isLabelledProfile(text: string | null | undefined): boolean {
  const head = String(text ?? "").trimStart();
  return LABELS.some((label) => head.startsWith(label));
}

/** The labelled parts of a profile_text ("<label>: <text>" lines); an unlabelled (older) text is one excerpt part. */
export function profileParts(text: string | null | undefined): ProfilePart[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  if (!isLabelledProfile(raw)) return [{ label: PROFILE_LABEL.excerpt, text: raw }];
  return raw.split("\n").flatMap((line) => {
    const label = LABELS.find((item) => line.startsWith(item));
    if (!label) return [];
    const at = line.indexOf(": ", label.length - 1);
    return at > 0 ? [{ label: line.slice(0, at), text: line.slice(at + 2) }] : [];
  });
}

/** The profile text of a person found by a search: the judge's summary of them, then the page it read. */
export function searchedProfileText(background: string | null | undefined, pageText: string | null | undefined): string | null {
  return profileTextFrom([
    { label: PROFILE_LABEL.summary, text: cleanSummary(background) },
    { label: PROFILE_LABEL.excerpt, text: pageExcerpt(pageText) },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// Names and handles

/**
 * How a person's name is kept when the page shows only a nickname or handle: "@<handle>", so a greeting never uses it
 * (mailRules.ts mailPersonName leaves out anything with "@": the greeting goes without a name) while Ops, the email
 * lookup and the address checks still see it. A real name is kept as written.
 */
export function storedPersonName(name: string | null | undefined, isHandle: boolean): string | null {
  const raw = String(name ?? "").replace(/\s+/g, " ").trim().replace(/^@+/, "");
  const clean = (isHandle ? raw.replace(/[^\p{L}\p{N}._\- ]/gu, "").trim() : raw).slice(0, 120);
  if (!clean) return null;
  return isHandle ? `@${clean}` : clean;
}

/** The handle a kept name stands for ("@jane" → "jane"), or null for a real name. */
export function nameHandle(name: string | null | undefined): string | null {
  const clean = String(name ?? "").trim();
  return clean.startsWith("@") && clean.length > 1 ? clean.slice(1).trim() || null : null;
}

/** The person's real name (null when unknown or only a handle). */
export function realName(name: string | null | undefined): string | null {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim();
  return clean && !clean.startsWith("@") ? clean : null;
}
