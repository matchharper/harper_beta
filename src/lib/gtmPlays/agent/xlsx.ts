/**
 * A small .xlsx reader for exported applicant sheets: the first worksheet's cells as text, nothing else (no formulas,
 * no formatting beyond turning date cells into ISO dates). An .xlsx is a zip of XML parts; Node's zlib inflates them,
 * so no dependency is needed. Pure apart from zlib.
 */
import { inflateRawSync } from "node:zlib";

/** Why a file could not be read: not a zip, damaged, password-protected, too large, or no worksheet. */
export type XlsxErrorCode = "not_xlsx" | "damaged" | "password" | "too_large" | "no_sheet";

export class XlsxError extends Error {
  constructor(readonly code: XlsxErrorCode, message: string) {
    super(message);
    this.name = "XlsxError";
  }
}

const MAX_PART_BYTES = 64 * 1024 * 1024;
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 500;

type ZipEntry = { flags: number; method: number; compressedSize: number; size: number; offset: number };

function zipEntries(zip: Buffer): Map<string, ZipEntry> {
  let end = -1;
  for (let index = zip.length - 22; index >= Math.max(0, zip.length - 22 - 0xffff); index -= 1) {
    if (zip.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) throw new XlsxError("not_xlsx", "The file is not a valid .xlsx (no zip directory).");
  const count = zip.readUInt16LE(end + 10);
  let position = zip.readUInt32LE(end + 16);
  if (count === 0xffff || position === 0xffffffff) throw new XlsxError("too_large", "The .xlsx is too large to read (zip64).");
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < count; index += 1) {
    if (position + 46 > zip.length || zip.readUInt32LE(position) !== 0x02014b50) {
      throw new XlsxError("damaged", "The .xlsx is damaged (broken zip directory).");
    }
    const nameLength = zip.readUInt16LE(position + 28);
    const name = zip.toString("utf8", position + 46, position + 46 + nameLength).replace(/\\/g, "/").replace(/^\//, "");
    entries.set(name.toLowerCase(), {
      flags: zip.readUInt16LE(position + 8),
      method: zip.readUInt16LE(position + 10),
      compressedSize: zip.readUInt32LE(position + 20),
      size: zip.readUInt32LE(position + 24),
      offset: zip.readUInt32LE(position + 42),
    });
    position += 46 + nameLength + zip.readUInt16LE(position + 30) + zip.readUInt16LE(position + 32);
  }
  return entries;
}

function partText(zip: Buffer, entries: Map<string, ZipEntry>, name: string): string | null {
  const entry = entries.get(name.toLowerCase());
  if (!entry) return null;
  if (entry.flags & 1) throw new XlsxError("password", "The .xlsx is password-protected.");
  if (entry.size > MAX_PART_BYTES) throw new XlsxError("too_large", "The .xlsx is too large to read.");
  if (entry.offset + 30 > zip.length || zip.readUInt32LE(entry.offset) !== 0x04034b50) {
    throw new XlsxError("damaged", "The .xlsx is damaged (broken zip entry).");
  }
  const start = entry.offset + 30 + zip.readUInt16LE(entry.offset + 26) + zip.readUInt16LE(entry.offset + 28);
  const data = zip.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.toString("utf8");
  if (entry.method !== 8) throw new XlsxError("damaged", `The .xlsx uses an unsupported compression (${entry.method}).`);
  try {
    return inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }).toString("utf8");
  } catch {
    throw new XlsxError("damaged", "The .xlsx is damaged (cannot unpack it).");
  }
}

// XML with an optional namespace prefix (some writers emit <x:c>, <x:row>…).
const NS = "(?:[\\w.-]+:)?";

function elements(xml: string, tag: string): Array<{ attrs: string; body: string }> {
  const pattern = new RegExp(`<${NS}${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${NS}${tag}>)`, "g");
  return Array.from(xml.matchAll(pattern), (match) => ({ attrs: match[1] ?? "", body: match[2] ?? "" }));
}

function firstBody(xml: string, tag: string): string | null {
  return new RegExp(`<${NS}${tag}\\b[^>]*?>([\\s\\S]*?)</${NS}${tag}>`).exec(xml)?.[1] ?? null;
}

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return match ? decodeXml(match[1] ?? match[2] ?? "") : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (whole, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower === "lt") return "<";
      if (lower === "gt") return ">";
      if (lower === "amp") return "&";
      if (lower === "quot") return '"';
      if (lower === "apos") return "'";
      const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    })
    // Excel writes control characters as _x000D_ (and a literal "_x" as _x005F_x).
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** All <t> text of a shared or inline string, without phonetic hints (<rPh>). */
function stringText(xml: string): string {
  const visible = xml.replace(new RegExp(`<${NS}rPh\\b[\\s\\S]*?</${NS}rPh>`, "g"), "");
  return elements(visible, "t").map((element) => decodeXml(element.body)).join("");
}

function columnIndex(ref: string): number | null {
  const letters = /^([A-Z]+)\d*$/i.exec(ref.trim())?.[1]?.toUpperCase();
  if (!letters) return null;
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

// Built-in number formats that are dates or times (27–36 and 50–58 are the East Asian date formats).
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormat(id: number, code: string | undefined): boolean {
  if (code === undefined) return DATE_FORMAT_IDS.has(id);
  const bare = code.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "").replace(/[_*]./g, "")
    .replace(/general/gi, "");
  return /[ymdhs]/i.test(bare);
}

/** Style indexes (the `s` of a cell) whose number format is a date or time. */
function dateStyles(stylesXml: string | null): Set<number> {
  const styles = new Set<number>();
  if (!stylesXml) return styles;
  const codes = new Map<number, string>();
  for (const format of elements(firstBody(stylesXml, "numFmts") ?? "", "numFmt")) {
    const id = Number(attr(format.attrs, "numFmtId"));
    if (Number.isFinite(id)) codes.set(id, attr(format.attrs, "formatCode") ?? "");
  }
  elements(firstBody(stylesXml, "cellXfs") ?? "", "xf").forEach((xf, index) => {
    const id = Number(attr(xf.attrs, "numFmtId") ?? 0);
    if (isDateFormat(id, codes.get(id))) styles.add(index);
  });
  return styles;
}

/** An Excel serial date as "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM:SS" when it has a time of day. */
function serialDate(serial: number, date1904: boolean): string {
  const date = new Date(Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86_400_000));
  if (Number.isNaN(date.getTime())) return String(serial);
  const iso = date.toISOString();
  return Number.isInteger(serial) ? iso.slice(0, 10) : iso.slice(0, 19);
}

/** Resolves a relationship target ("worksheets/sheet1.xml" or "/xl/worksheets/sheet1.xml") to a zip path. */
function partPath(target: string): string {
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/**
 * The first worksheet of an .xlsx as rows of trimmed text cells. Row N of the sheet is rows[N - 1] (missing rows are
 * empty arrays), so row numbers match what a person sees in Excel. Throws XlsxError for files it cannot read.
 */
export function readXlsxRows(bytes: Uint8Array): string[][] {
  const zip = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (zip.length < 22) throw new XlsxError("not_xlsx", "The file is not a valid .xlsx (too short).");
  const entries = zipEntries(zip);
  const workbook = partText(zip, entries, "xl/workbook.xml");
  if (workbook === null) throw new XlsxError("not_xlsx", "The file is not an Excel workbook (no xl/workbook.xml).");
  const relations = elements(partText(zip, entries, "xl/_rels/workbook.xml.rels") ?? "", "Relationship").map((element) => ({
    id: attr(element.attrs, "Id"), type: attr(element.attrs, "Type") ?? "", target: attr(element.attrs, "Target") ?? "",
  }));
  const relationOfType = (suffix: string) => relations.find((relation) => relation.type.endsWith(suffix))?.target;

  const firstSheet = elements(firstBody(workbook, "sheets") ?? "", "sheet")[0];
  const sheetRelation = firstSheet ? /\s[\w.-]+:id\s*=\s*"([^"]*)"/.exec(firstSheet.attrs)?.[1] : undefined;
  const sheetTarget = relations.find((relation) => relation.id === sheetRelation)?.target;
  const sheetPath = sheetTarget ? partPath(sheetTarget)
    : [...entries.keys()].filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name)).sort()[0];
  const sheet = sheetPath ? partText(zip, entries, sheetPath) : null;
  if (sheet === null) throw new XlsxError("no_sheet", "The workbook has no worksheet.");

  const shared = elements(partText(zip, entries, partPath(relationOfType("/sharedStrings") ?? "sharedStrings.xml")) ?? "", "si")
    .map((element) => stringText(element.body));
  const dates = dateStyles(partText(zip, entries, partPath(relationOfType("/styles") ?? "styles.xml")));
  const date1904 = /date1904\s*=\s*"(1|true)"/i.test(/<(?:[\w.-]+:)?workbookPr\b[^>]*>/.exec(workbook)?.[0] ?? "");

  const rows: string[][] = [];
  for (const row of elements(firstBody(sheet, "sheetData") ?? "", "row")) {
    const rowNumber = Number(attr(row.attrs, "r"));
    if (Number.isInteger(rowNumber) && rowNumber > rows.length + 1) {
      if (rowNumber > MAX_ROWS) break;
      while (rows.length < rowNumber - 1) rows.push([]);
    }
    if (rows.length >= MAX_ROWS) break;
    const cells: string[] = [];
    let next = 0;
    for (const cell of elements(row.body, "c")) {
      const ref = attr(cell.attrs, "r");
      const column = (ref ? columnIndex(ref) : null) ?? next;
      next = column + 1;
      if (column >= MAX_COLUMNS) continue;
      const type = attr(cell.attrs, "t") ?? "n";
      const raw = firstBody(cell.body, "v");
      const value = raw === null ? null : decodeXml(raw);
      let text: string;
      if (type === "inlineStr") text = stringText(firstBody(cell.body, "is") ?? "");
      else if (type === "s") text = shared[Number(value)] ?? "";
      else if (type === "b") text = value === "1" ? "TRUE" : value === "0" ? "FALSE" : "";
      else if (type === "e" || value === null) text = "";
      else if (type === "str" || type === "d") text = value;
      else {
        const number = Number(value);
        const style = Number(attr(cell.attrs, "s") ?? 0);
        text = !Number.isFinite(number) ? value : dates.has(style) ? serialDate(number, date1904) : String(number);
      }
      cells[column] = text.trim();
    }
    rows.push(Array.from(cells, (cell) => cell ?? ""));
  }
  return rows;
}
