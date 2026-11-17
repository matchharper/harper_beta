/**
 * #5 pilot 1: LinkedIn Recruiter applicants a person exported (CSV/XLSX) or copied (tab-separated) from Recruiter and
 * pasted on /ops #5 or dropped in the shared Drive folder (applicantSheet.ts reads the file into rows). The export's
 * exact columns are not confirmed yet, so the header is read by name (English or Korean) and anything unknown is kept
 * as profile text. Pure.
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

/** A person field a column can hold. First and last name are joined into `name`. */
export type ApplicantField = keyof Omit<ImportedPerson, "extra"> | "firstName" | "lastName";

/** What a table of applicants holds beyond the people: per-column fields and row counts. */
export type ApplicantTable = ImportParse & {
  /** The field each header column was read as (null: kept as profile text). */
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
  ["profileUrl", /(profile|linkedin|프로필).*(url|link|주소)?$|^url$/i],
  ["name", /^(full ?name|name|candidate( name)?|applicant( name)?|이름|성명|지원자|지원자 ?(이름|명))$/i],
  ["location", /^(location|current location|지역|위치|거주지)$/i],
  ["currentCompany", /^(current company|company|회사|현재 회사)$/i],
  ["appliedJob", /^(job|job title|job post(ing)?( title)?|posting( title)?|applied (for|job|to)|position|공고|공고명|채용 ?공고|지원 공고|지원한 공고)$/i],
  ["appliedAt", /^(applied|applied (at|date|on|time)|date applied|application date|apply date|지원일|지원 ?일자|지원 ?일시|지원 날짜)$/i],
];

/** The field a column header names, or null for a column kept as profile text. */
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
    const keep = (column: number, value: string) => { if (header[column]) extra.push(`${header[column]}: ${value.slice(0, 500)}`); };
    let profileColumn = -1;
    cells.forEach((raw, column) => {
      const value = String(raw ?? "").trim();
      const field = fields[column];
      if (!value) return;
      if (field === "firstName" || field === "lastName") {
        const part = field === "firstName" ? "first" : "last";
        if (names[part] === null) names[part] = value.slice(0, 200); else keep(column, value);
      } else if (field === "email") {
        // "Email status" and the like also start with "email": only a real address counts.
        if (!person.email && cleanEmail(value)) person.email = cleanEmail(value); else keep(column, value);
      } else if (field === "profileUrl") {
        // A public linkedin.com/in/ URL beats a Recruiter-only one; the other stays as text.
        if (!cleanProfileUrl(value)) keep(column, value);
        else if (!person.profileUrl) { person.profileUrl = value; profileColumn = column; }
        else if (!isPublicProfile(person.profileUrl) && isPublicProfile(value)) {
          keep(profileColumn, person.profileUrl);
          person.profileUrl = value;
          profileColumn = column;
        } else keep(column, value);
      } else if (field && person[field] === null) person[field] = value.slice(0, 2_000);
      else keep(column, value);
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
