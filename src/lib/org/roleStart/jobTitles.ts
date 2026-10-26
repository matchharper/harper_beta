/**
 * Job title helpers for the role start job-match score. Titles are compared as
 * written on profiles; a title that only names a rank, a generic function or
 * an org unit ("Software Engineer", "선임 / 데이터팀", "Manager") does not say
 * which job the person did, so its experience is judged from the description.
 */

/** Same rule as the SQL used to fill the title table: lowercase, single spaces. */
export function normalizeTitle(title: string | null | undefined) {
  return String(title ?? "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
}

const LEVEL_WORDS = new Set([
  "senior", "sr", "sr.", "junior", "jr", "jr.", "lead", "principal", "staff", "chief", "associate", "assistant",
  "head", "of", "the", "and", "&", "i", "ii", "iii", "iv", "1", "2", "3", "4", "global", "regional", "acting",
  "interim", "former", "freelance", "contract", "part-time", "full-time", "remote", "new", "grad", "graduate",
]);

const GENERIC_TITLES = new Set([
  "engineer", "software engineer", "software developer", "developer", "programmer", "software development engineer",
  "member of technical staff", "manager", "general manager", "consultant", "advisor", "mentor", "intern", "internship",
  "trainee", "founder", "co-founder", "cofounder", "owner", "researcher", "research assistant", "research associate",
  "student researcher", "analyst", "director", "executive director", "managing director", "vice president", "president",
  "team lead", "team leader", "tech lead", "technical lead", "engineering lead", "freelancer", "employee", "staff member",
  "개발자", "소프트웨어 엔지니어", "엔지니어", "연구원", "인턴", "대표", "프리랜서", "개발", "소프트웨어개발",
]);

const RANK_WORDS = new Set([
  "사원", "대리", "과장", "차장", "부장", "매니저", "주임", "선임", "책임", "수석", "연구원", "선임연구원", "책임연구원",
  "수석연구원", "전임연구원", "주임연구원", "프로", "팀장", "팀원", "파트장", "이사", "상무", "전무", "본부장", "실장",
  "센터장", "그룹장", "리더", "인턴", "계약직", "정규직",
]);

const ORG_UNIT = /(팀|본부|실|부서|센터|그룹|사업부|division|department|dept\.?|team|group|unit|lab)$/;

function isGenericPart(part: string) {
  if (GENERIC_TITLES.has(part) || RANK_WORDS.has(part)) return true;
  const words = part.split(" ").filter((word) => !LEVEL_WORDS.has(word));
  const core = words.join(" ").trim();
  if (!core) return true;
  if (GENERIC_TITLES.has(core) || RANK_WORDS.has(core)) return true;
  if (words.every((word) => RANK_WORDS.has(word))) return true;
  return ORG_UNIT.test(core);
}

/** True when the title names no specific job (rank, generic function or org unit only). */
export function isBroadTitle(title: string | null | undefined) {
  const normalized = normalizeTitle(title);
  if (!normalized) return true;
  const parts = normalized
    .split(/\s*(?:[/|,·()]|\s-\s|\s–\s|\s—\s)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.every(isGenericPart);
}

/** Internships and similar short training roles weigh less in the job-match score. */
export function isInternship(title: string | null | undefined, employmentType: string | null | undefined) {
  const type = normalizeTitle(employmentType);
  if (/intern|apprentice|인턴|수습|trainee/.test(type)) return true;
  return /(^|[^a-z])(intern|internship|trainee)([^a-z]|$)|인턴/.test(normalizeTitle(title));
}
