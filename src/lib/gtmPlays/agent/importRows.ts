/**
 * #5 pilot 1: LinkedIn Recruiter applicants a person exported (CSV/XLSX) or copied (tab-separated) from Recruiter and
 * pasted on /ops #5 or dropped in the shared Drive folder (applicantSheet.ts reads the file into rows). The export's
 * exact columns are not confirmed yet, so the header is read by name (English or Korean). Only what the agent uses is
 * kept (item 13 of the 11/17 review): who the person is, where they work, what they applied to and when, and their
 * profile columns (summary, skills, experience, education) as profile text without phone numbers or addresses. Every
 * other column (phone, address, ZIP, screening answers, salary, notes …) is dropped: neither stored nor sent to the
 * model. Pure.
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
  /** The profile columns (summary, skills, experience, education …), "Header: value" lines; null when none. */
  extra: string | null;
};

export type ImportParse = { people: ImportedPerson[]; skipped: Array<{ line: number; reason: string }>; columns: string[] };

/** A person field a column can hold. First and last name are joined into `name`; profile columns become `extra`. */
export type ApplicantField = keyof Omit<ImportedPerson, "extra"> | "firstName" | "lastName" | "profile";

/** What a table of applicants holds beyond the people: per-column fields and row counts. */
export type ApplicantTable = ImportParse & {
  /** The field each header column was read as (null: not read; the column is dropped). */
  fields: Array<ApplicantField | null>;
  /** Rows under the header with any value. */
  dataRows: number;
  /** Of those, rows without a usable email (kept by profile URL, or skipped). */
  withoutEmail: number;
};

// First match wins, so the narrow patterns come before the broad profile one.
const FIELDS: Array<[ApplicantField, RegExp]> = [
  ["email", /^(e-?mail|email address|이메일|메일)/i],
  ["firstName", /^(first ?name|given name)$/i],
  ["lastName", /^(last ?name|surname|family name|성)$/i],
  ["headline", /^((linkedin |profile )?headline|title|current title|current position|직함|헤드라인)$/i],
  // What the person wrote about their work (matching reads it). Before profileUrl, whose pattern takes any "profile …".
  ["profile", /^((linkedin |profile )?(summary|about( me)?)|bio|introduction|(top |key )?skills?|(work )?experiences?|work history|(past |previous )?positions?|past compan(y|ies)|previous compan(y|ies)|education|schools?|degrees?|field of study|years of experience|total experience|industry|자기소개|소개|요약|기술|보유 ?기술|스킬|경력|경력 ?사항|이전 ?경력|이전 ?회사|학력|학교|전공|총 ?경력|산업|업종)$/i],
  ["profileUrl", /(profile|linkedin|프로필).*(url|link|주소)?$|^url$/i],
  ["name", /^(full ?name|name|candidate( name)?|applicant( name)?|이름|성명|지원자|지원자 ?(이름|명))$/i],
  ["location", /^(location|current location|지역|위치|거주지)$/i],
  ["currentCompany", /^(current company|company|회사|현재 회사)$/i],
  ["appliedJob", /^(job|job title|job post(ing)?( title)?|posting( title)?|applied (for|job|to)|position|공고|공고명|채용 ?공고|지원 공고|지원한 공고)$/i],
  ["appliedAt", /^(applied|applied (at|date|on|time)|date applied|application date|apply date|지원일|지원 ?일자|지원 ?일시|지원 날짜)$/i],
];

/** The field a column header names, or null for a column that is not read (dropped). */
export function headerField(header: string): ApplicantField | null {
  const name = header.trim();
  return FIELDS.find(([, pattern]) => pattern.test(name))?.[0] ?? null;
}

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

/** CSV or tab-separated text (tabs when the first line has one) as rows of cells. Blank lines are dropped. */
export function textTable(text: string): string[][] {
  const lines = logicalLines(text);
  if (!lines.length) return [];
  const separator = lines[0].includes("\t") ? "\t" : ",";
  return lines.map((line) => splitRow(line, separator));
}

/** "Jane" + "Doe" → "Jane Doe"; Korean 길동 + 홍 → "홍길동". */
function joinName(first: string | null, last: string | null): string | null {
  if (!first || !last) return first ?? last;
  return /[ㄱ-ㆎ가-힣]/.test(`${last}${first}`) ? `${last}${first}` : `${first} ${last}`;
}

const isPublicProfile = (value: string) => /^([a-z0-9-]+\.)?linkedin\.com\/in\//.test(cleanProfileUrl(value) ?? "");

/** Phone numbers and email addresses written inside a profile column: the agent never needs them. */
const CONTACT_IN_TEXT = [
  /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,}/gi,
  /(?<![\p{L}\p{N}])(?:\+?82[-.\s]?0?|0)1[016-9][-.\s]?\d{3,4}[-.\s]?\d{4}(?![\p{N}])/gu,
  /(?<![\p{L}\p{N}])\+\d{1,3}[-.\s]?(?:\(?\d{1,4}\)?[-.\s]?){2,4}\d{2,4}(?![\p{N}])/gu,
];

/** A profile column's value without contact details, on as few lines as it needs. */
export function profileColumnText(value: string): string {
  return CONTACT_IN_TEXT.reduce((text, pattern) => text.replace(pattern, " "), value)
    .replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Reads applicants from rows of cells. The first row is the header, `headerLine` its line number (for skip reasons).
 * Up to `limit` people; a row needs an email or a profile URL.
 */
export function applicantsFromRows(rows: string[][], limit = 500, headerLine = 1): ApplicantTable {
  const empty: ApplicantTable = { people: [], skipped: [], columns: [], fields: [], dataRows: 0, withoutEmail: 0 };
  if (!rows.length) return empty;
  const header = rows[0].map((cell) => String(cell ?? "").trim());
  let fields = header.map(headerField);
  // Korean exports split 성 / 이름: 이름 is then the given name.
  if (fields.includes("lastName") && !fields.includes("firstName")) {
    fields = fields.map((field, column) => (field === "name" && header[column] === "이름" ? "firstName" : field));
  }
  // A header with no known column: treat the paste as having no header is unsafe; report it.
  if (!fields.some(Boolean)) {
    return { ...empty, skipped: [{ line: headerLine, reason: "알 수 있는 열 이름이 없어요(이름·이메일·프로필 URL 등)" }], columns: header };
  }
  const people: ImportedPerson[] = [];
  const skipped: ImportParse["skipped"] = [];
  let dataRows = 0;
  let withoutEmail = 0;
  rows.slice(1).forEach((cells, index) => {
    const line = headerLine + 1 + index;
    if (!cells.some((cell) => String(cell ?? "").trim())) return;
    dataRows += 1;
    const person: ImportedPerson = {
      name: null, email: null, profileUrl: null, headline: null, location: null, currentCompany: null, appliedJob: null,
      appliedAt: null, extra: null,
    };
    const names: { first: string | null; last: string | null } = { first: null, last: null };
    const extra: string[] = [];
    // Only profile columns become profile text; a second value for a field (another name or email column, the
    // Recruiter-only profile link) and every column not read are dropped.
    cells.forEach((raw, column) => {
      const value = String(raw ?? "").trim();
      const field = fields[column];
      if (!value || !field) return;
      if (field === "profile") {
        const text = profileColumnText(value).slice(0, 500);
        if (text && header[column]) extra.push(`${header[column]}: ${text}`);
      } else if (field === "firstName" || field === "lastName") {
        const part = field === "firstName" ? "first" : "last";
        if (names[part] === null) names[part] = value.slice(0, 200);
      } else if (field === "email") {
        // "Email status" and the like also start with "email": only a real address counts.
        if (!person.email && cleanEmail(value)) person.email = cleanEmail(value);
      } else if (field === "profileUrl") {
        // A public linkedin.com/in/ URL beats a Recruiter-only one.
        if (!cleanProfileUrl(value)) return;
        if (!person.profileUrl || (!isPublicProfile(person.profileUrl) && isPublicProfile(value))) person.profileUrl = value;
      } else if (person[field] === null) person[field] = value.slice(0, 2_000);
    });
    if (!person.name) person.name = joinName(names.first, names.last);
    person.extra = extra.length ? extra.join("\n").slice(0, 4_000) : null;
    if (!person.email) withoutEmail += 1;
    if (!person.email && !person.profileUrl) { skipped.push({ line, reason: "이메일도 프로필 URL도 없어요" }); return; }
    if (people.length >= limit) { skipped.push({ line, reason: `한 번에 ${limit}명까지예요` }); return; }
    people.push(person);
  });
  return { people, skipped, columns: header, fields, dataRows, withoutEmail };
}

/** Reads pasted applicants. The first line is the header. Up to `limit` people. */
export function parseApplicants(text: string, limit = 500): ApplicantTable {
  return applicantsFromRows(textTable(text), limit);
}

const DAY_MS = 86_400_000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const YMD = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;
const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?$/i;
const MONTH_DAY_YEAR = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i;
const DAY_MONTH_YEAR = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/i;
const ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;

/** A calendar date and time read as UTC, or NaN when the day does not exist (2/31). */
function utc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  const at = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(at);
  return month >= 1 && month <= 12 && hour < 24 && minute < 60 && second < 60 && date.getUTCDate() === day && date.getUTCMonth() === month - 1
    ? at : Number.NaN;
}

/**
 * When an applicant applied, as an ISO time, from the export's "Date Applied": 2026-11-15, 2026-11-15T12:00:00 (an
 * xlsx date cell), 2026. 11. 15., 2026년 11월 15일, 11/15/2026, Nov 15, 2026 or 15 Nov 2026. A date or time without a
 * zone is read as UTC (the same on any server). Null when it is not a date, before 2000 or after `now` (a day's slack).
 */
export function appliedAtIso(value: string | null | undefined, now = new Date()): string | null {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  let at = Number.NaN;
  let match: RegExpExecArray | null;
  if (ZONED.test(raw)) at = Date.parse(raw);
  else if ((match = YMD.exec(raw))) {
    const [, year, month, day, hour, minute, second] = match.map(Number);
    at = utc(year, month, day, hour || 0, minute || 0, second || 0);
  } else if ((match = MDY.exec(raw))) {
    const [, month, day, year, hour, minute, second] = match.slice(0, 7).map(Number);
    const half = match[7]?.toLowerCase();
    const hours = half ? (hour % 12) + (half === "pm" ? 12 : 0) : hour || 0;
    at = half && (hour < 1 || hour > 12) ? Number.NaN : utc(year < 100 ? 2000 + year : year, month, day, hours, minute || 0, second || 0);
  } else if ((match = MONTH_DAY_YEAR.exec(raw) ?? DAY_MONTH_YEAR.exec(raw))) {
    const named = /^\d/.test(raw) ? match[2] : match[1];
    const day = Number(/^\d/.test(raw) ? match[1] : match[2]);
    const month = MONTHS.indexOf(named.slice(0, 3).toLowerCase()) + 1;
    at = month ? utc(Number(match[3]), month, day) : Number.NaN;
  }
  if (!Number.isFinite(at) || at < Date.UTC(2000, 0, 1) || at > now.getTime() + DAY_MS) return null;
  return new Date(at).toISOString();
}

/** An applicant's signal: they started applying to a Harper posting on LinkedIn ("Apply starters"), and when. */
export function applicantSignal(
  person: Pick<ImportedPerson, "appliedJob" | "appliedAt">, now = new Date(), company: string | null = null,
): { signalText: string; signalAt: string | null } {
  const job = person.appliedJob?.replace(/\s+/g, " ").trim();
  // A company's own applicant list (applicantList.ts) says whose posting they applied to; else LinkedIn Apply starters.
  const head = company ? `${company} 공고 지원` : "링크드인 공고 지원 시작";
  return { signalText: job ? `${head} · ${job}` : head, signalAt: appliedAtIso(person.appliedAt, now) };
}
