/**
 * #5 사람 찾기, what Harper can propose (Shaun 11/18: "이직을 원하는 사람 중 하퍼가 적합한 공고를 추천할 수 있는
 * 경력"). The search is worth a person only when the posting matcher (match.server.ts) can then give them a
 * fitting posting, so the planner aims at the careers Harper has open postings for, in
 * proportion to how many companies hire for them, and the judge scores how likely a seeker's career fits them.
 *
 * The demand is read once per run (demand.server.ts, from the matcher's own pools: open customer and GTM Roles, and
 * the public postings the matcher's search can return) and summarized here by role family × level × place, with the
 * industries the titles and company lines name and a few example titles. No model call: titles are sorted by the
 * same rules for every run. Pure.
 */

// ---------------------------------------------------------------------------------------------------------------
// Role families

/** The role families the search plans by (software, data/ML, product and design: what the sources are searched for). */
export const ROLE_FAMILIES = ["infra/DevOps/SRE", "data/ML/AI", "QA/security", "product/PM", "design", "mobile", "frontend", "backend"] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];
export type RoleFamilyCount = { family: RoleFamily; count: number };

/** Plain Korean names for /ops. */
export const ROLE_FAMILY_LABEL: Record<RoleFamily, string> = {
  "infra/DevOps/SRE": "인프라·DevOps", "data/ML/AI": "데이터·ML·AI", "QA/security": "QA·보안", "product/PM": "기획·PM",
  design: "디자인", mobile: "모바일", frontend: "프론트엔드", backend: "백엔드",
};

/**
 * In order: the first rule that fits a title decides (a product designer is design, a data platform role data/ML/AI;
 * a design-system engineer is not a designer).
 */
const ROLE_FAMILY_RULES: ReadonlyArray<readonly [readonly RoleFamily[], RegExp]> = [
  [["design"], /design(?!\s*system)|디자인(?!\s*시스템)|디자이너|\bux\b/i],
  [["product/PM"], /product\s*(manager|owner|lead)|\b(pm|po)\b|기획|프로덕트\s*(매니저|오너)/i],
  [["QA/security"], /\bqa\b|quality assurance|\btest|security|보안|품질|테스트/i],
  [["data/ML/AI"], /data|\bml\b|mlops|machine learning|\bai\b|llm|deep learning|research|scientist|analyst|analytics|데이터|머신러닝|딥러닝|인공지능|분석/i],
  [["infra/DevOps/SRE"], /devops|\bsre\b|site reliability|infra|platform|cloud|인프라|데브옵스|클라우드/i],
  [["mobile"], /\bios\b|android|mobile|flutter|react native|모바일|안드로이드/i],
  [["frontend", "backend"], /full.?stack|풀스택/i],
  [["frontend"], /front.?end|프론트|\bweb\b|웹\s*(개발|퍼블리셔)/i],
  [["backend"], /back.?end|백엔드|server|서버|\bapi\b|software engineer|소프트웨어 (엔지니어|개발자)/i],
];

/** The families a title belongs to: none (sales, operations …), one, or both ends for a full-stack title. */
export function roleFamiliesOf(title: string | null | undefined): readonly RoleFamily[] {
  const text = String(title ?? "");
  return ROLE_FAMILY_RULES.find(([, rule]) => rule.test(text))?.[0] ?? [];
}

/** Titles by role family (the first rule that fits; a full-stack title counts for both ends), most first. */
export function roleFamilyCounts(titles: ReadonlyArray<string | null | undefined>): RoleFamilyCount[] {
  const counts = new Map<RoleFamily, number>();
  for (const title of titles) {
    for (const family of roleFamiliesOf(title)) counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts].map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count || ROLE_FAMILIES.indexOf(a.family) - ROLE_FAMILIES.indexOf(b.family));
}

export function isRoleFamily(value: unknown): value is RoleFamily {
  return ROLE_FAMILIES.includes(value as RoleFamily);
}

// ---------------------------------------------------------------------------------------------------------------
// Level, place, industry

/** entry: 신입·주니어; mid: 경력; senior: 시니어·리드; any: the posting does not say. */
export type DemandLevel = "entry" | "mid" | "senior" | "any";
export const DEMAND_LEVEL_LABEL: Record<DemandLevel, string> = { entry: "신입·주니어", mid: "경력", senior: "시니어·리드", any: "연차 무관" };
const LEVEL_WORD: Record<DemandLevel, string> = { entry: "entry/junior", mid: "mid", senior: "senior/lead", any: "level not stated" };

const SENIOR = /senior|staff|principal|\blead\b|head of|director|manager|시니어|리드|책임|수석|팀장/i;
const ENTRY = /entry|junior|new[ _-]?grad|intern|신입|주니어|인턴/i;

/** A posting's level: from its title first (시니어 …, Junior …), else its seniority_level. */
export function levelOf(seniorityLevel: string | null | undefined, title: string | null | undefined): DemandLevel {
  const name = String(title ?? "");
  if (SENIOR.test(name)) return "senior";
  if (ENTRY.test(name)) return "entry";
  const level = String(seniorityLevel ?? "").toLowerCase();
  if (!level.trim()) return "any";
  if (/entry|junior|intern|new[ _-]?grad|associate/.test(level)) return "entry";
  if (/senior|staff|principal|lead|director|executive|manager|head/.test(level) && !/mid/.test(level)) return "senior";
  return "mid";
}

/** korea; remote (whatever the country); a country code for a posting abroad ("US"); unknown when it says nothing. */
export type DemandPlace = "korea" | "remote" | "unknown" | (string & {});
const KOREA_PLACE = /서울|경기|판교|성남|분당|수원|인천|부산|대전|대구|광주|울산|세종|제주|한국|korea|seoul/i;

export function placeOf(countryCode: string | null | undefined, workMode: string | null | undefined, locationText: string | null | undefined): DemandPlace {
  if (/remote|원격|재택/i.test(String(workMode ?? ""))) return "remote";
  const country = String(countryCode ?? "").trim().toUpperCase();
  if (country === "KR") return "korea";
  if (/^[A-Z]{2}$/.test(country)) return country;
  return KOREA_PLACE.test(String(locationText ?? "")) ? "korea" : "unknown";
}

export function placeLabel(place: DemandPlace): string {
  return place === "korea" ? "한국" : place === "remote" ? "원격" : place === "unknown" ? "지역 안 적힘" : `해외(${place})`;
}
const placeWord = (place: DemandPlace) => (place === "korea" ? "Korea" : place === "remote" ? "remote" : place === "unknown" ? "place not stated" : `abroad (${place})`);

/** Industries a title or a company line names (a hint for the queries; most postings name none). */
const INDUSTRY_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["결제·핀테크", /결제|정산|원장|핀테크|금융|증권|보험|fintech|payment|ledger|banking|\bpay\b/i],
  ["커머스", /커머스|쇼핑|리테일|마켓플레이스|commerce|retail|marketplace/i],
  ["모빌리티", /모빌리티|자율주행|차량|mobility|autonomous/i],
  ["물류", /물류|배송|풀필먼트|logistics|delivery|fulfil?ment|supply chain/i],
  ["헬스케어", /헬스케어|의료|병원|바이오|healthcare|medical|biotech/i],
  ["게임", /게임|game|gaming/i],
  ["교육", /교육|에듀|이러닝|edtech|education/i],
  ["여행", /여행|숙박|travel|hospitality/i],
  ["추천·검색", /추천|랭킹|검색|recommend|ranking|search/i],
  ["AI·LLM", /\bai\b|인공지능|llm|생성형|genai|generative/i],
  ["B2B SaaS", /saas|b2b/i],
  ["미디어·콘텐츠", /미디어|콘텐츠|엔터|media|content/i],
];

export function industriesOf(...texts: Array<string | null | undefined>): string[] {
  const text = texts.filter(Boolean).join(" ");
  return INDUSTRY_RULES.filter(([, rule]) => rule.test(text)).map(([label]) => label);
}

// ---------------------------------------------------------------------------------------------------------------
// The summary

/** One open posting (or a group of same-titled ones) as the demand reads it. */
export type DemandPosting = {
  kind: "external" | "customer" | "gtm";
  title: string;
  /** How many postings this row stands for (a group of same-titled public postings), at least 1. */
  count?: number;
  /** The companies posting it (workspace ids; a GTM Role's company is its public description): fits count by company. */
  companies: readonly string[];
  seniorityLevel: string | null;
  countryCode: string | null;
  workMode: string | null;
  locationText: string | null;
};

/** A role family × level × place group of open postings. */
export type DemandSegment = { level: DemandLevel; place: DemandPlace; postings: number; companies: number };

export type DemandFamily = {
  family: RoleFamily;
  postings: number;
  /** Different companies hiring for it: a person needs fitting postings at 2 of them. */
  companies: number;
  /** Of the postings, customers' and GTM Roles. */
  internal: number;
  /** Most postings first. */
  segments: DemandSegment[];
  /** Industries the titles or the companies' one-line descriptions name, by companies. */
  industries: Array<{ industry: string; companies: number }>;
  /** A few titles, the most posted first. */
  examples: string[];
};

export type DemandSummary = {
  /** The Korea-time day it was read. */
  day: string;
  postings: number;
  companies: number;
  internal: number;
  external: number;
  /** Families with open postings, the most companies first. */
  families: DemandFamily[];
  /** Postings in no family (sales, operations, hardware …): the search does not look for them. */
  other: { postings: number; examples: string[] };
  places: Array<{ place: DemandPlace; postings: number }>;
};

/** A family needs open postings at this many companies before the search aims at it (a mail needs 2 fits). */
export const MIN_DEMAND_COMPANIES = 2;
const EXAMPLES = 4;
const SEGMENTS = 4;
const INDUSTRIES = 3;

type FamilyTally = {
  postings: number; companies: Set<string>; internal: number;
  segments: Map<string, { level: DemandLevel; place: DemandPlace; postings: number; companies: Set<string> }>;
  industries: Map<string, Set<string>>; titles: Map<string, number>;
};

const topCounts = (map: Map<string, number>, max: number) => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
const cleanTitle = (title: string) => title.replace(/\s+/g, " ").trim().slice(0, 80);

/**
 * The open postings by role family × level × place, with the industries their titles or companies name (by
 * `companyTexts`: a company's one-line description, by the same keys as DemandPosting.companies) and example titles.
 */
export function summarizeDemand(postings: readonly DemandPosting[], day: string, companyTexts: ReadonlyMap<string, string> = new Map()): DemandSummary {
  const companyIndustries = new Map<string, string[]>();
  const industriesAt = (company: string) => companyIndustries.get(company)
    ?? companyIndustries.set(company, industriesOf(companyTexts.get(company))).get(company)!;
  const families = new Map<RoleFamily, FamilyTally>();
  const allCompanies = new Set<string>();
  const places = new Map<string, number>();
  const otherTitles = new Map<string, number>();
  let total = 0;
  let internal = 0;
  let other = 0;
  for (const posting of postings) {
    const count = Math.max(1, Math.round(posting.count ?? 1));
    const title = cleanTitle(posting.title);
    if (!title) continue;
    total += count;
    if (posting.kind !== "external") internal += count;
    posting.companies.forEach((company) => allCompanies.add(company));
    const place = placeOf(posting.countryCode, posting.workMode, posting.locationText);
    places.set(place, (places.get(place) ?? 0) + count);
    const inFamilies = roleFamiliesOf(title);
    if (!inFamilies.length) {
      other += count;
      otherTitles.set(title, (otherTitles.get(title) ?? 0) + count);
      continue;
    }
    const level = levelOf(posting.seniorityLevel, title);
    const titleIndustries = industriesOf(title);
    for (const family of inFamilies) {
      const tally = families.get(family) ?? {
        postings: 0, companies: new Set<string>(), internal: 0, segments: new Map(), industries: new Map(), titles: new Map(),
      };
      families.set(family, tally);
      tally.postings += count;
      if (posting.kind !== "external") tally.internal += count;
      posting.companies.forEach((company) => tally.companies.add(company));
      const key = `${level}|${place}`;
      const segment = tally.segments.get(key) ?? { level, place, postings: 0, companies: new Set<string>() };
      tally.segments.set(key, segment);
      segment.postings += count;
      posting.companies.forEach((company) => segment.companies.add(company));
      for (const company of posting.companies) {
        for (const industry of new Set([...titleIndustries, ...industriesAt(company)])) {
          (tally.industries.get(industry) ?? tally.industries.set(industry, new Set()).get(industry)!).add(company);
        }
      }
      tally.titles.set(title, (tally.titles.get(title) ?? 0) + count);
    }
  }
  return {
    day, postings: total, companies: allCompanies.size, internal, external: total - internal,
    families: [...families].map(([family, tally]): DemandFamily => ({
      family, postings: tally.postings, companies: tally.companies.size, internal: tally.internal,
      segments: [...tally.segments.values()].sort((a, b) => b.postings - a.postings || b.companies.size - a.companies.size)
        .slice(0, SEGMENTS).map((item) => ({ level: item.level, place: item.place, postings: item.postings, companies: item.companies.size })),
      industries: topCounts(new Map([...tally.industries].map(([industry, companies]) => [industry, companies.size])), INDUSTRIES)
        .map(([industry, companies]) => ({ industry, companies })),
      examples: topCounts(tally.titles, EXAMPLES).map(([title]) => title),
    })).sort((a, b) => b.companies - a.companies || b.postings - a.postings || ROLE_FAMILIES.indexOf(a.family) - ROLE_FAMILIES.indexOf(b.family)),
    other: { postings: other, examples: topCounts(otherTitles, 3).map(([title]) => title) },
    places: [...places].map(([place, count]) => ({ place, postings: count })).sort((a, b) => b.postings - a.postings),
  };
}

/** The families the search aims at (open postings at MIN_DEMAND_COMPANIES or more companies), the most first. */
export function demandFamilies(summary: DemandSummary | null | undefined): DemandFamily[] {
  return (summary?.families ?? []).filter((item) => item.companies >= MIN_DEMAND_COMPANIES);
}

/** Families with too few companies hiring (none, or one): no queries for them. */
export function thinFamilies(summary: DemandSummary | null | undefined): RoleFamily[] {
  const aimed = new Set(demandFamilies(summary).map((item) => item.family));
  return ROLE_FAMILIES.filter((family) => !aimed.has(family));
}

export type DemandAllocation = Array<{ family: RoleFamily; queries: number }>;

/**
 * How a round's queries split over the aimed families, in proportion to the companies hiring for each (largest
 * remainder; ties to the larger family). A family's share may round to 0 when there are more families than queries.
 */
export function demandAllocation(summary: DemandSummary | null | undefined, slots: number): DemandAllocation {
  const families = demandFamilies(summary);
  const total = families.reduce((sum, item) => sum + item.companies, 0);
  if (!total || slots <= 0) return [];
  const shares = families.map((item) => ({ family: item.family, exact: (item.companies / total) * slots }));
  const out = shares.map((item) => ({ family: item.family, queries: Math.floor(item.exact) }));
  let left = slots - out.reduce((sum, item) => sum + item.queries, 0);
  const order = shares.map((item, index) => ({ index, rest: item.exact - Math.floor(item.exact) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    out[index].queries += 1;
    left -= 1;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// As the planner and the judge read it

const segmentText = (segment: DemandSegment) => `${LEVEL_WORD[segment.level]} in ${placeWord(segment.place)} ${segment.postings}`;

/** One family as a prompt line: postings, companies, levels and places, industries, example titles. */
function familyLine(item: DemandFamily): string {
  const industries = item.industries.length ? `; industries named: ${item.industries.map((entry) => `${entry.industry} at ${entry.companies}`).join(", ")}` : "";
  return `- ${item.family}: ${item.postings} posting${item.postings === 1 ? "" : "s"} at ${item.companies} compan${item.companies === 1 ? "y" : "ies"} (${item.segments.map(segmentText).join(", ")}${industries}); e.g. ${item.examples.map((title) => `"${title}"`).join(", ")}`;
}

/**
 * The demand as a delimited prompt block: what the matcher can propose, by family (the families the search aims at),
 * where the postings are, and the families with no or too few companies hiring. "" without a summary.
 */
export function demandBlock(summary: DemandSummary | null | undefined): string {
  if (!summary || !summary.postings) return "";
  const aimed = demandFamilies(summary);
  const thin = thinFamilies(summary);
  const places = summary.places.map((item) => `${placeWord(item.place)} ${item.postings}`).join(", ");
  return [
    `Harper's open postings now (what the posting matcher can propose; read ${summary.day}): ${summary.postings} postings at ${summary.companies} companies (${summary.internal} from Harper's customers, ${summary.external} public). By place: ${places}.`,
    "<open_postings>",
    ...(aimed.length ? aimed.map(familyLine) : ["- (no role family has open postings at 2 or more companies)"]),
    thin.length ? `- No or too few companies hiring (fewer than ${MIN_DEMAND_COMPANIES}): ${thin.join(", ")}` : "",
    summary.other.postings ? `- Outside these families (not searched for): ${summary.other.postings} posting${summary.other.postings === 1 ? "" : "s"}` : "",
    "</open_postings>",
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Stored on the run (gtm_agent_runs.signal_log.demand) and read back

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const list = (value: unknown) => (Array.isArray(value) ? value : []).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
const LEVELS: readonly DemandLevel[] = ["entry", "mid", "senior", "any"];

/** A stored summary as read back (anything malformed dropped), or null. */
export function readDemandSummary(value: unknown): DemandSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const day = text(record.day, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const other = record.other && typeof record.other === "object" ? record.other as Record<string, unknown> : {};
  return {
    day, postings: num(record.postings), companies: num(record.companies), internal: num(record.internal), external: num(record.external),
    families: list(record.families).filter((item) => isRoleFamily(item.family)).map((item) => ({
      family: item.family as RoleFamily, postings: num(item.postings), companies: num(item.companies), internal: num(item.internal),
      segments: list(item.segments).map((segment) => ({
        level: LEVELS.includes(segment.level as DemandLevel) ? segment.level as DemandLevel : "any",
        place: text(segment.place, 12) || "unknown", postings: num(segment.postings), companies: num(segment.companies),
      })),
      industries: list(item.industries).map((entry) => ({ industry: text(entry.industry, 40), companies: num(entry.companies) })).filter((entry) => entry.industry),
      examples: (Array.isArray(item.examples) ? item.examples : []).filter((title): title is string => typeof title === "string").map((title) => title.slice(0, 80)),
    })),
    other: {
      postings: num(other.postings),
      examples: (Array.isArray(other.examples) ? other.examples : []).filter((title): title is string => typeof title === "string").map((title) => title.slice(0, 80)),
    },
    places: list(record.places).map((item) => ({ place: text(item.place, 12) || "unknown", postings: num(item.postings) })),
  };
}
