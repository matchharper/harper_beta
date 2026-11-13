/**
 * #2 anonymous cards go to a company that has not met the candidate, so code (not only the prompt) checks
 * that no card names the person, an employer or a school, or carries a link or an address. Pure; tested in
 * cardPrivacy.test.ts.
 */

/** Words too common to identify anyone on their own; a full name made only of these is ignored as well. */
const GENERIC_WORDS = new Set([
  "ai", "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "llc", "plc", "gmbh", "sa",
  "ag", "bv", "pte", "kk", "labs", "lab", "group", "holdings", "holding", "the", "and", "of", "for", "korea",
  "korean", "seoul", "busan", "asia", "global", "international", "national", "tech", "technology", "technologies",
  "university", "univ", "college", "school", "institute", "academy", "freelance", "freelancer", "self-employed",
  "self", "employed", "stealth", "startup", "consulting", "partners", "capital", "ventures", "venture",
  "securities", "bank", "investment", "investments", "solutions", "systems", "software", "services", "studio",
  "studios", "digital", "data", "media", "network", "networks", "research", "center", "centre", "foundation",
  "management", "marketing", "product", "engineering", "design", "sales", "business", "strategy", "operations",
  "team", "new", "open", "united", "first", "high", "middle", "graduate", "science", "sciences", "arts",
  "주식회사", "회사", "대학교", "대학", "대학원", "고등학교", "연구소", "연구원", "스타트업", "프리랜서", "그룹", "코리아",
  "테크", "랩", "서울", "한국", "글로벌", "기업", "학교", "본사", "지사",
]);

const LEGAL_SUFFIX = /(?:,?\s+(?:inc|incorporated|corp|corporation|co|ltd|limited|llc|plc|gmbh|sa|ag|bv|pte|kk)\.?)+$/i;
const URL_LIKE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|io|ai|co|kr|net|org|dev|app|me|xyz)\b/i;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const HANGUL = /[ㄱ-ㆎ가-힣]/;

/** An organisation's name for comparing: lower case, no (주)/주식회사, no legal suffix, no punctuation. */
export function normalizeOrgName(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사/g, " ")
    .replace(/[.,·]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEGAL_SUFFIX, "")
    .replace(/[^\p{L}\p{N}&+ -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGeneric(token: string) {
  const words = token.split(/[\s-]+/).filter(Boolean);
  return !words.length || words.every((word) => GENERIC_WORDS.has(word));
}

/** "X (formerly Y)" and "X / Y" name two organisations; both are checked. */
function orgVariants(value: string | null | undefined) {
  const raw = String(value ?? "");
  const parts = [raw.replace(/\([^)]*\)/g, " "), ...[...raw.matchAll(/\(([^)]*)\)/g)].map((match) => match[1])]
    .flatMap((part) => part.split(/\s\/\s|;/))
    .map((part) => part.replace(/^\s*(?:formerly|previously|ex-|전\s)/i, ""));
  return parts.map(normalizeOrgName).filter(Boolean);
}

/**
 * Organisation tokens: the whole normalised name, plus its first word when that word is distinctive on its
 * own (4+ letters, or 2+ Hangul, and not a generic word like "Seoul" or "Capital").
 */
function orgTokens(value: string | null | undefined) {
  return orgVariants(value).flatMap((name) => {
    const tokens = isGeneric(name) ? [] : [name];
    const head = name.split(" ")[0] ?? "";
    const distinctive = HANGUL.test(head) ? head.length >= 2 : head.length >= 4;
    if (name.includes(" ") && distinctive && !GENERIC_WORDS.has(head)) tokens.push(head);
    return tokens;
  });
}

/**
 * The employer a headline names: after " at " or "@" (up to the next separator), and organisations marked
 * "ex-" / "formerly" in any part. Other "|" parts are usually skills ("Venture Capital | Private Markets"),
 * not employers, and are left to the experience list.
 */
export function headlineOrgs(headline: string | null | undefined) {
  const text = String(headline ?? "");
  const found: string[] = [];
  for (const match of text.matchAll(/(?:\s+at\s+|@\s*)([^|,·(/\n]+)/gi)) found.push(match[1]);
  for (const match of text.matchAll(/(?:\bex-|\bformerly\s+|\bpreviously\s+)([^|,·()/\n]+)/gi)) found.push(match[1]);
  return found.map((item) => item.trim()).filter(Boolean);
}

export type CardPrivacyFacts = {
  name: string | null;
  headline: string | null;
  experiences: Array<{ company: string | null }>;
  educations: Array<{ school: string | null }>;
};

/** Everything that would identify this member if it showed up on their card. */
export function identifyingTokens(member: CardPrivacyFacts) {
  const name = String(member.name ?? "").normalize("NFKC").toLowerCase().trim();
  const nameTokens = [name, ...name.split(/[\s,()·]+/)]
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !GENERIC_WORDS.has(part));
  const orgs = [
    ...member.experiences.map((row) => row.company),
    ...member.educations.map((row) => row.school),
    ...headlineOrgs(member.headline),
  ].flatMap(orgTokens);
  return [...new Set([...nameTokens, ...orgs])].filter((token) => token.length >= 2);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether `text` (already normalised) contains `token`: for Latin text a whole word (a Korean particle right
 * after it, as in "Clarus에서", still counts), for Hangul any position.
 */
function containsToken(text: string, token: string) {
  if (HANGUL.test(token)) return text.includes(token);
  const pattern = escapeRegExp(token).replace(/\s+/g, "[\\s-]+");
  return new RegExp(`(?<![\\p{Script=Latin}\\p{N}])${pattern}(?![\\p{Script=Latin}\\p{N}])`, "u").test(text);
}

/**
 * What on this card identifies the member (empty: safe to send). The text checked is the title, the
 * highlights and the fit line.
 */
export function cardLeaks(card: { title: string; highlights: string[]; fit: string }, tokens: string[]) {
  const raw = [card.title, ...card.highlights, card.fit].join("\n");
  const text = raw.normalize("NFKC").toLowerCase();
  const leaks = tokens.filter((token) => containsToken(text, token));
  if (URL_LIKE.test(raw)) leaks.push("링크");
  if (EMAIL_LIKE.test(raw)) leaks.push("이메일");
  return leaks;
}

/**
 * Whether an employer name is the posting company: equal after normalising, or one is the other's leading
 * words ("Sierra" / "Sierra Technologies"), never on a generic or under-3-letter name.
 */
export function isSameOrg(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeOrgName(a);
  const right = normalizeOrgName(b);
  if (!left || !right) return false;
  if (left === right) return !isGeneric(left);
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  if (short.length < 3 || isGeneric(short)) return false;
  return long.startsWith(`${short} `);
}
