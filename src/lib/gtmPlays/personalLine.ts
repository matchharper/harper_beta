/**
 * The opening of a candidate mail: the greeting, then the person's own line (맞춤 한 줄) when there is one. Pure (no
 * imports), so the #5 agent's mails and tests place it the same way.
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
