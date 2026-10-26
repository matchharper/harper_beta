/**
 * One row of the 참고 인물 box (the role facts step and the 매칭 기준 tab):
 * a link, a profile (a resume or pasted text), or both, and what the team
 * liked. Shared by the screen and the route, so both check rows the same way.
 */
export type RoleStartReferenceRow = { url: string | null; text: string | null; liked: string | null };

/** Rows per submit; the Brief keeps at most 5 people in all. */
export const MAX_REFERENCE_ROWS = 5;
const MAX_PROFILE_CHARS = 12_000;
const MAX_LIKED_CHARS = 1_000;

/** An http(s) link, with https:// added when left out; null when it is not one. */
export function referenceLink(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A row that can be submitted: a link or a profile is needed; null otherwise. */
export function referenceRowOf(input: unknown): RoleStartReferenceRow | null {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const url = referenceLink(value.url);
  const text = String(value.text ?? "").trim().slice(0, MAX_PROFILE_CHARS) || null;
  if (!url && !text) return null;
  const liked = String(value.liked ?? "").trim().slice(0, MAX_LIKED_CHARS) || null;
  return { url, text, liked };
}

/** What the team liked, as one answer: the picked chips, then their own words. */
export function likedAnswer(chips: string[], words: string) {
  return [chips.join(", "), words.trim()].filter(Boolean).join(" / ");
}

/** Extract only URL syntax. The rest stays verbatim for the LLM to interpret as the team's reason. */
export function referenceRowFromInput(input: string): RoleStartReferenceRow | null {
  const value = input.trim();
  const match = value.match(/(?<![\w:/.-])(?:https?:\/\/|(?:www\.|[a-z]{2}\.)?linkedin\.com\/)[^\s<>"\[\]]+/i);
  if (!match) return null;
  const link = match[0].replace(/[),.;!?]+$/, "");
  const url = referenceLink(link);
  if (!url) return null;
  const reason = (value.slice(0, match.index) + value.slice((match.index ?? 0) + link.length)).trim();
  return { url, text: null, liked: reason || null };
}
