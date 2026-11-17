/**
 * The first screen after sign-up for someone who came from a #4 후보 메일: the posting the mail was about
 * (company · title · location and a short description). Pure, so the server and tests share it.
 */

export type GtmInviteFirstScreen = {
  mailId: string;
  companyName: string | null;
  title: string;
  location: string | null;
  /** A few plain sentences from the posting (no markdown); empty when it has no text. */
  summary: string;
  /**
   * Every posting the mail proposed (an agent mail has 2-3), each with why it fits; empty for a one-posting mail
   * (the fields above are that posting).
   */
  postings: GtmInviteFirstScreenPosting[];
};

export type GtmInviteFirstScreenPosting = { companyName: string | null; title: string; location: string | null; summary: string };

/** The mail's proposed postings as the first screen lists them (each with a title; the reason as its summary). */
export function firstScreenPostings(value: unknown): GtmInviteFirstScreenPosting[] {
  if (!Array.isArray(value)) return [];
  const text = (item: unknown) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : "");
  return value.flatMap((raw) => {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const title = text(item.title);
    if (!title) return [];
    return [{
      companyName: text(item.companyName) || null,
      title,
      location: text(item.location) || null,
      summary: text(item.summary) || text(item.why),
    }];
  }).slice(0, 3);
}

/** Where the screen remembers it was shown for a mail (once per mail, in this browser). */
export const gtmInviteFirstScreenSeenKey = (mailId: string) => `harper:gtm-invite-first-screen:${mailId}`;

const SUMMARY_MAX = 240;

/**
 * Markdown posting text → its opening as plain text (section titles left out), cut at a sentence end before
 * `max` characters (or at a word with "…" when the first sentence is longer).
 */
export function shortPostingSummary(markdown: string | null | undefined, max = SUMMARY_MAX): string {
  const plain = String(markdown ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Section titles ("About the role") are not part of what the posting says.
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, " ")
    .replace(/^\s{0,3}([-*+]|\d+[.)]|>)\s+/gm, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const head = plain.slice(0, max);
  const sentenceEnd = Math.max(...[". ", "다. ", "요. ", "! ", "? "].map((mark) => {
    const at = head.lastIndexOf(mark);
    return at >= 0 ? at + mark.length - 1 : -1;
  }));
  if (sentenceEnd >= max * 0.4) return head.slice(0, sentenceEnd).trim();
  const space = head.lastIndexOf(" ");
  return `${(space > max * 0.6 ? head.slice(0, space) : head).trim()}…`;
}
