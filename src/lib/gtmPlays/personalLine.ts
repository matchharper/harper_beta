/**
 * #4 후보 메일의 맞춤 한 줄: one sentence right after the greeting saying why we write to this person for this
 * Role, written from that person's own search result. Pure (no imports), so the sender, the composer and tests
 * place it the same way.
 */

export type GtmMailLanguage = "ko" | "en";

/** "김하준님, 안녕하세요." / "Hi Hajun,". The name is the person's own (first word in English). */
export function gtmCandidateGreeting(language: GtmMailLanguage, name: string | null | undefined) {
  const clean = name?.trim() || null;
  if (language === "en") return clean ? `Hi ${clean.split(/\s+/)[0]},` : "Hi,";
  return clean ? `${clean}님, 안녕하세요.` : "안녕하세요.";
}

/** The line as one plain sentence (spaces and line breaks collapsed, wrapping quotes dropped); null when empty. */
export function cleanPersonalLine(value: string | null | undefined): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().replace(/^["'“‘「]+|["'”’」]+$/g, "").trim();
  return text || null;
}

/** The mail's opening paragraphs: the greeting, then this person's line when there is one. */
export function gtmCandidateOpening(language: GtmMailLanguage, name: string | null | undefined, line?: string | null) {
  const personal = cleanPersonalLine(line);
  return personal ? [gtmCandidateGreeting(language, name), personal] : [gtmCandidateGreeting(language, name)];
}

/** The key a person's line is kept under on the screen and in the send request. */
export const personalLineKey = (item: { source: string; ref: string }) => `${item.source}:${item.ref}`;

/**
 * How long a role was held, for the facts the line is written from (code counts, the model does not): whole
 * months from "YYYY-MM[-DD]" to the end date or `today`; null when the start is unknown or after the end.
 */
export function experienceMonths(start: string | null | undefined, end: string | null | undefined, today = new Date()) {
  const parse = (value: string | null | undefined) => {
    const match = /^(\d{4})-(\d{2})/.exec(value?.trim() ?? "");
    return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
  };
  const from = parse(start);
  const to = parse(end) ?? today.getUTCFullYear() * 12 + today.getUTCMonth();
  if (from === null || to < from) return null;
  return to - from + 1;
}

/** "4 years 2 months", "8 months": a duration in the model's facts. */
export function durationText(months: number | null) {
  if (months === null || months <= 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} year${years > 1 ? "s" : ""}` : "", rest ? `${rest} month${rest > 1 ? "s" : ""}` : ""]
    .filter(Boolean).join(" ");
}
