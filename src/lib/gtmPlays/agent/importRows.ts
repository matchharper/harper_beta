/**
 * #5 pilot 1: LinkedIn Recruiter applicants a person exported (CSV) or copied (tab-separated) from Recruiter and
 * pasted on /ops #5. The export's exact columns are not confirmed yet, so the header is read by name (English or
 * Korean) and anything unknown is kept as profile text. Pure.
 */
import { cleanEmail, cleanProfileUrl } from "./people";

export type ImportedPerson = {
  name: string | null;
  email: string | null;
  profileUrl: string | null;
  headline: string | null;
  location: string | null;
  currentCompany: string | null;
  /** The posting they applied to on LinkedIn (the signal). */
  appliedJob: string | null;
  appliedAt: string | null;
  /** Every other column, "Header: value" lines. */
  extra: string | null;
};

export type ImportParse = { people: ImportedPerson[]; skipped: Array<{ line: number; reason: string }>; columns: string[] };

const FIELDS: Array<[keyof Omit<ImportedPerson, "extra">, RegExp]> = [
  ["email", /^(e-?mail|email address|이메일|메일)/i],
  ["profileUrl", /(profile|linkedin|프로필).*(url|link|주소)?$|^url$/i],
  ["name", /^(full ?name|name|이름|성명|지원자)$/i],
  ["headline", /^(headline|title|current title|직함|헤드라인)$/i],
  ["location", /^(location|지역|위치)$/i],
  ["currentCompany", /^(current company|company|회사|현재 회사)$/i],
  ["appliedJob", /^(job|job title|applied (for|job|to)|position|공고|지원 공고|지원한 공고)$/i],
  ["appliedAt", /^(applied|applied (at|date|on)|date applied|지원일|지원 날짜)$/i],
];

/** Splits one line of CSV (quotes allowed) or tab-separated text. */
export function splitRow(line: string, separator: "," | "\t"): string[] {
  if (separator === "\t") return line.split("\t").map((cell) => cell.trim());
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { cells.push(cell.trim()); cell = ""; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

/** Joins lines a quoted cell broke over (CSV allows line breaks inside quotes). */
function logicalLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    current = current ? `${current}\n${raw}` : raw;
    if ((current.match(/"/g)?.length ?? 0) % 2 === 0) { lines.push(current); current = ""; }
  }
  if (current) lines.push(current);
  return lines.filter((line) => line.trim());
}

/** Reads pasted applicants. The first line is the header. Up to `limit` people. */
export function parseApplicants(text: string, limit = 500): ImportParse {
  const lines = logicalLines(text);
  if (!lines.length) return { people: [], skipped: [], columns: [] };
  const separator = lines[0].includes("\t") ? "\t" : ",";
  const header = splitRow(lines[0], separator);
  const fieldOf = header.map((name) => FIELDS.find(([, pattern]) => pattern.test(name.trim()))?.[0] ?? null);
  // A header with no known column: treat the paste as having no header is unsafe; report it.
  if (!fieldOf.some(Boolean)) return { people: [], skipped: [{ line: 1, reason: "알 수 있는 열 이름이 없어요(이름·이메일·프로필 URL 등)" }], columns: header };
  const people: ImportedPerson[] = [];
  const skipped: ImportParse["skipped"] = [];
  lines.slice(1).forEach((line, index) => {
    if (people.length >= limit) { skipped.push({ line: index + 2, reason: `한 번에 ${limit}명까지예요` }); return; }
    const cells = splitRow(line, separator);
    const person: ImportedPerson = {
      name: null, email: null, profileUrl: null, headline: null, location: null, currentCompany: null, appliedJob: null,
      appliedAt: null, extra: null,
    };
    const extra: string[] = [];
    cells.forEach((value, column) => {
      const field = fieldOf[column];
      if (!value) return;
      if (field && person[field] === null) person[field] = value.slice(0, 2_000);
      else if (header[column]) extra.push(`${header[column]}: ${value.slice(0, 500)}`);
    });
    person.email = person.email ? cleanEmail(person.email) : null;
    person.profileUrl = person.profileUrl && cleanProfileUrl(person.profileUrl) ? person.profileUrl.trim() : null;
    person.extra = extra.length ? extra.join("\n").slice(0, 4_000) : null;
    if (!person.email && !person.profileUrl) { skipped.push({ line: index + 2, reason: "이메일도 프로필 URL도 없어요" }); return; }
    people.push(person);
  });
  return { people, skipped, columns: header };
}
