/**
 * #5: a LinkedIn Recruiter applicant export (Apply starters → "Export all to XLSX", or a CSV) as the rows pasted
 * applicants become (importRows.ts). It works on the file's bytes, so a file dropped on /ops #5 is read the same way
 * wherever it comes from. The export's exact columns are not confirmed, so the header is found by name in the first
 * rows (a title line above it is kept as `preamble`). Pure apart from zlib; errors are plain Korean for the /ops screen.
 */
import { applicantsFromRows, headerField, textTable, type ApplicantField, type ImportedPerson } from "./importRows";
import { readXlsxSheets, XlsxError } from "./xlsx";

/**
 * Largest file /ops #5 takes. An export of a few thousand people is well under 1 MB; the file goes to the server as
 * base64 JSON (4/3 larger), which must stay under Vercel's 4.5 MB request body limit.
 */
export const APPLICANT_FILE_MAX_BYTES = 3 * 1024 * 1024;
/** People read from one file (the whole Apply starters list comes every time). */
export const APPLICANT_FILE_MAX_PEOPLE = 2_000;

export class ApplicantSheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicantSheetError";
  }
}

export type ApplicantSheetFormat = "xlsx" | "csv";

export type ApplicantSheet = {
  format: ApplicantSheetFormat;
  /** People with an email or a profile URL, in file order. */
  rows: ImportedPerson[];
  /** Rows under the header with any value: everyone in the file. */
  totalRows: number;
  /** Of those, rows without a usable email. */
  rowsWithoutEmail: number;
  recognisedHeaders: Array<{ header: string; field: ApplicantField }>;
  /** Columns not read: dropped, neither stored nor sent to the model (phone, address, screening answers …). */
  unknownHeaders: string[];
  /** The header's row number (as Excel shows it; for CSV, the non-blank line), 0 when no known column was found. */
  headerRow: number;
  /** Non-empty rows above the header, cells joined with " · " (an export title such as the job post's name). */
  preamble: string[];
  skipped: Array<{ line: number; reason: string }>;
};

const IDENTITY_FIELDS: ReadonlyArray<ApplicantField> = ["email", "profileUrl", "name", "firstName", "lastName"];
/** Fields that say a row is a header of people (a profile column alone, such as "Skills", does not). */
const HEADER_FIELDS = (field: ApplicantField | null) => Boolean(field) && field !== "profile";
const HEADER_SEARCH_ROWS = 20;

const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);

/** What the bytes are: an .xlsx (zip), an old .xls / password-protected workbook (OLE), text, or something else. */
export function applicantSheetFormat(bytes: Uint8Array): ApplicantSheetFormat | "xls" | null {
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return "xlsx";
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "xls";
  if (startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff])) return "csv";
  const head = bytes.subarray(0, 4_096);
  if (head.includes(0)) return null;
  const text = decodeSheetText(head).trimStart().toLowerCase();
  return text.startsWith("<") ? null : "csv";
}

/** CSV bytes as text: UTF-8 (with or without BOM), UTF-16 with BOM, else EUC-KR (Korean Excel's "CSV"). */
export function decodeSheetText(bytes: Uint8Array): string {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (startsWith(bytes, [0xff, 0xfe])) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (startsWith(bytes, [0xfe, 0xff])) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

/**
 * The sheet with the people: the one whose header names a person column (name, email, profile), with the most known
 * columns; a LinkedIn Recruiter export puts an "Overview" tab first and "Job Applicants" second.
 */
function xlsxTable(bytes: Uint8Array): string[][] {
  try {
    const sheets = readXlsxSheets(bytes);
    const scored = sheets.map((sheet) => {
      const header = sheet.rows[headerIndex(sheet.rows)] ?? [];
      const fields = header.map((cell) => (cell ? headerField(cell) : null)).filter(Boolean);
      const identity = fields.some((field) => field && IDENTITY_FIELDS.includes(field));
      return { rows: sheet.rows, score: (identity ? 100 : 0) + fields.length };
    });
    return scored.reduce((best, sheet) => (sheet.score > best.score ? sheet : best), scored[0]).rows;
  } catch (error) {
    if (!(error instanceof XlsxError)) throw error;
    if (error.code === "password") throw new ApplicantSheetError("암호가 걸린 파일이에요. 암호 없이 저장해서 올려 주세요.");
    if (error.code === "too_large") throw new ApplicantSheetError("파일이 너무 커서 읽지 못했어요.");
    throw new ApplicantSheetError("엑셀 파일을 읽지 못했어요. 링크드인에서 다시 내려받아 올려 주세요.");
  }
}

/** The header row: the first of the top rows naming a person column (name, email, profile), else any known column. */
function headerIndex(table: string[][]): number {
  const top = table.slice(0, HEADER_SEARCH_ROWS).map((cells) => cells.map((cell) => (cell ? headerField(cell) : null)));
  const identity = top.findIndex((fields) => fields.some((field) => field && IDENTITY_FIELDS.includes(field)));
  if (identity >= 0) return identity;
  const known = top.findIndex((fields) => fields.some(HEADER_FIELDS));
  if (known >= 0) return known;
  return Math.max(0, table.findIndex((cells) => cells.some((cell) => cell.trim())));
}

/**
 * Reads an applicant export (.xlsx or .csv bytes) into people. Throws ApplicantSheetError when the file cannot be
 * read; a readable file without a known column comes back with headerRow 0 and the reason in `skipped`.
 */
export function parseApplicantSheet(bytes: Uint8Array, options: { limit?: number } = {}): ApplicantSheet {
  if (!bytes.length) throw new ApplicantSheetError("빈 파일이에요.");
  const format = applicantSheetFormat(bytes);
  if (format === "xls") {
    throw new ApplicantSheetError("예전 엑셀 형식(.xls)이거나 암호가 걸린 파일이에요. 링크드인에서 XLSX로 다시 내려받거나 .xlsx로 저장해서 올려 주세요.");
  }
  if (!format) throw new ApplicantSheetError("엑셀(.xlsx)이나 CSV 파일만 읽을 수 있어요.");
  const table = format === "xlsx" ? xlsxTable(bytes) : textTable(decodeSheetText(bytes));
  const index = headerIndex(table);
  const parsed = applicantsFromRows(table.slice(index), options.limit ?? APPLICANT_FILE_MAX_PEOPLE, index + 1);
  const recognisedHeaders: ApplicantSheet["recognisedHeaders"] = [];
  const unknownHeaders: string[] = [];
  parsed.columns.forEach((header, column) => {
    const field = parsed.fields[column];
    if (field) recognisedHeaders.push({ header, field });
    else if (header) unknownHeaders.push(header);
  });
  return {
    format,
    rows: parsed.people,
    totalRows: parsed.dataRows,
    rowsWithoutEmail: parsed.withoutEmail,
    recognisedHeaders,
    unknownHeaders,
    headerRow: recognisedHeaders.length ? index + 1 : 0,
    preamble: table.slice(0, index).map((cells) => cells.filter(Boolean).join(" · ")).filter(Boolean),
    skipped: parsed.skipped,
  };
}
