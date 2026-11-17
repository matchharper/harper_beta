/**
 * Organisation names compared the way production compares them, so the member search leaves out people who work
 * at the posting's company now. Pure; tested in cardPrivacy.test.ts.
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
