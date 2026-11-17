import assert from "node:assert/strict";
import test from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { ApplicantSheetError, applicantSheetFormat, parseApplicantSheet } from "./applicantSheet";
import { readXlsxRows, XlsxError } from "./xlsx";

/** A zip as Excel writes it: local headers, then the central directory. `stored` parts are not compressed. */
function zip(parts: Array<[name: string, content: string]>, stored: string[] = []): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of parts) {
    const raw = Buffer.from(content, "utf8");
    const method = stored.includes(name) ? 0 : 8;
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
const RELS_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** A workbook whose first sheet is "Apply starters" (sheet2.xml, so the reader must follow the relationship). */
function workbook(sheetXml: string, sharedStrings: string[], options: { date1904?: boolean } = {}): Uint8Array {
  const shared = sharedStrings.map((value) => `<si>${value.startsWith("<") ? value : `<t xml:space="preserve">${value}</t>`}</si>`).join("");
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RELS_TYPE}">`
      + `<workbookPr${options.date1904 ? ' date1904="1"' : ""}/><sheets><sheet name="Apply starters" sheetId="1" r:id="rId7"/>`
      + '<sheet name="Other" sheetId="2" r:id="rId8"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId8" Type="${RELS_TYPE}/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId7" Type="${RELS_TYPE}/worksheet" Target="/xl/worksheets/sheet2.xml"/>`
      + `<Relationship Id="rId9" Type="${RELS_TYPE}/sharedStrings" Target="sharedStrings.xml"/>`
      + `<Relationship Id="rId10" Type="${RELS_TYPE}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/sharedStrings.xml", `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared}</sst>`],
    ["xl/styles.xml", '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd hh:mm"/><numFmt numFmtId="165" formatCode="#,##0&quot;원&quot;"/></numFmts>'
      + '<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>'
      + '<cellXfs count="4"><xf numFmtId="0" xfId="0"/><xf numFmtId="14" xfId="0" applyNumberFormat="1"/>'
      + '<xf numFmtId="164" xfId="0"><alignment wrapText="1"/></xf><xf numFmtId="165" xfId="0"/></cellXfs></styleSheet>'],
    ["xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>wrong sheet</t></is></c></row></sheetData></worksheet>'],
    ["xl/worksheets/sheet2.xml", sheetXml],
  ], ["xl/styles.xml"]);
}

const sheet = (rows: string) => `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;

test("xlsx: an Apply starters export with a title row, split names, dates and an unknown column", () => {
  const strings = [
    "Apply starters – Backend Engineer (Acme)", // 0
    "First Name", "Last Name", "Headline", "Location", "Public Profile URL", "Email Address", "Applied Date", "Phone", // 1-8
    "Jane", "Doe", "Backend Engineer &amp; SRE", "Seoul", "https://www.linkedin.com/in/jane-doe/", " Jane.Doe@Example.com ", // 9-14
    "길동", "홍", "<r><t>데이터 </t></r><r><rPr><b/></rPr><t>엔지니어</t></r><rPh><t>phonetic</t></rPh>", // 15-17
    "https://kr.linkedin.com/in/gildong", "No", "Contact", // 18-20
  ];
  const bytes = workbook(sheet([
    '<row r="1"><c r="A1" t="s"><v>0</v></c></row>',
    '<row r="3">' + [1, 2, 3, 4, 5, 6, 7, 8].map((index, column) => `<c r="${"ABCDEFGH"[column]}3" t="s"><v>${index}</v></c>`).join("") + "</row>",
    '<row r="4"><c r="A4" t="s"><v>9</v></c><c r="B4" t="s"><v>10</v></c><c r="C4" t="s"><v>11</v></c><c r="D4" t="s"><v>12</v></c>'
      + '<c r="E4" t="s"><v>13</v></c><c r="F4" t="s"><v>14</v></c><c r="G4" s="1"><v>46341</v></c><c r="H4"><v>821012345678</v></c></row>',
    '<row r="5"><c r="A5" t="s"><v>15</v></c><c r="B5" t="s"><v>16</v></c><c r="C5" t="s"><v>17</v></c>'
      + '<c r="E5" t="s"><v>18</v></c><c r="G5" s="2"><v>46341.5</v></c></row>',
    '<row r="6"><c r="A6" t="s"><v>19</v></c><c r="B6" t="s"><v>20</v></c></row>',
    '<row r="7"><c r="A7" t="inlineStr"><is><t></t></is></c><c r="B7"/></row>',
  ].join("")), strings);

  assert.equal(applicantSheetFormat(bytes), "xlsx");
  const parsed = parseApplicantSheet(bytes);
  assert.equal(parsed.format, "xlsx");
  assert.equal(parsed.headerRow, 3);
  assert.deepEqual(parsed.preamble, ["Apply starters – Backend Engineer (Acme)"]);
  assert.deepEqual(parsed.recognisedHeaders.map((item) => `${item.header}=${item.field}`), [
    "First Name=firstName", "Last Name=lastName", "Headline=headline", "Location=location", "Public Profile URL=profileUrl",
    "Email Address=email", "Applied Date=appliedAt",
  ]);
  assert.deepEqual(parsed.unknownHeaders, ["Phone"]);
  assert.equal(parsed.totalRows, 3);
  assert.equal(parsed.rowsWithoutEmail, 2);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], {
    name: "Jane Doe", email: "jane.doe@example.com", profileUrl: "https://www.linkedin.com/in/jane-doe/",
    headline: "Backend Engineer & SRE", location: "Seoul", currentCompany: null, appliedJob: null, appliedAt: "2026-11-15",
    extra: "Phone: 821012345678",
  });
  assert.equal(parsed.rows[1].name, "홍길동");
  assert.equal(parsed.rows[1].headline, "데이터 엔지니어");
  assert.equal(parsed.rows[1].email, null);
  assert.equal(parsed.rows[1].appliedAt, "2026-11-15T12:00:00");
  assert.deepEqual(parsed.skipped, [{ line: 6, reason: "이메일도 프로필 URL도 없어요" }]);
});

test("xlsx reader: prefixed XML, cells without refs, booleans, errors, escapes, 1904 dates", () => {
  const rows = readXlsxRows(workbook(
    '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>'
      + '<x:row r="1"><x:c t="s"><x:v>0</x:v></x:c><x:c t="b"><x:v>1</x:v></x:c><x:c t="e"><x:v>#N/A</x:v></x:c>'
      + '<x:c t="str"><x:v>a &lt; b</x:v></x:c><x:c s="3"><x:v>1500</x:v></x:c><x:c s="1"><x:v>0</x:v></x:c></x:row>'
      + '<x:row r="2"><x:c r="C2" t="inlineStr"><x:is><x:t>line_x000D_\nbreak</x:t></x:is></x:c></x:row>'
      + "</x:sheetData></x:worksheet>",
    ["first &#xAC00;&#44032;"],
    { date1904: true },
  ));
  assert.deepEqual(rows, [
    ["first 가가", "TRUE", "", "a < b", "1500", "1904-01-01"],
    ["", "", "line\r\nbreak"],
  ]);
  assert.throws(() => readXlsxRows(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])), (error) => error instanceof XlsxError && error.code === "not_xlsx");
  assert.throws(() => readXlsxRows(zip([["hello.txt", "hi"]])), (error) => error instanceof XlsxError && error.code === "not_xlsx");
});

test("csv bytes: UTF-8 with BOM, Korean headers, two profile URLs, an email status column", () => {
  const csv = "﻿이름,이메일 상태,이메일,링크드인 프로필,프로필 링크,공고명,지원 일자,메모\n"
    + "홍길동,확인됨,gildong@example.com,https://www.linkedin.com/talent/profile/AEMAA1,https://www.linkedin.com/in/gildong,백엔드 엔지니어,2026-11-14,\"첫 줄\n둘째 줄\"\n"
    + "김철수,,,,,백엔드 엔지니어,2026-11-14,\n";
  const parsed = parseApplicantSheet(new Uint8Array(Buffer.from(csv, "utf8")));
  assert.equal(parsed.format, "csv");
  assert.equal(parsed.headerRow, 1);
  assert.equal(parsed.totalRows, 2);
  assert.equal(parsed.rowsWithoutEmail, 1);
  assert.equal(parsed.rows.length, 1);
  const [person] = parsed.rows;
  assert.equal(person.email, "gildong@example.com");
  assert.equal(person.profileUrl, "https://www.linkedin.com/in/gildong");
  assert.equal(person.appliedJob, "백엔드 엔지니어");
  assert.equal(person.appliedAt, "2026-11-14");
  assert.equal(person.extra, "이메일 상태: 확인됨\n링크드인 프로필: https://www.linkedin.com/talent/profile/AEMAA1\n메모: 첫 줄\n둘째 줄");
  assert.deepEqual(parsed.skipped, [{ line: 3, reason: "이메일도 프로필 URL도 없어요" }]);
});

test("csv bytes: UTF-16 and Korean Excel's EUC-KR", () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Name\tEmail\n홍길동\thong@example.com\n", "utf16le")]);
  assert.equal(parseApplicantSheet(new Uint8Array(utf16)).rows[0].name, "홍길동");
  // "이름,이메일\n홍길동,hong@example.com\n" saved as EUC-KR.
  const eucKr = Buffer.from("c0ccb8a72cc0ccb8dec0cf0ac8abb1e6b5bf2c686f6e67406578616d706c652e636f6d0a", "hex");
  const parsed = parseApplicantSheet(new Uint8Array(eucKr));
  assert.deepEqual([parsed.rows[0].name, parsed.rows[0].email], ["홍길동", "hong@example.com"]);
});

test("files that are not an applicant export", () => {
  const sheetError = (bytes: Uint8Array, pattern: RegExp) =>
    assert.throws(() => parseApplicantSheet(bytes), (error) => error instanceof ApplicantSheetError && pattern.test(error.message));
  sheetError(new Uint8Array(), /빈 파일/);
  sheetError(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), /\.xls/);
  sheetError(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 1, 2]), /엑셀\(\.xlsx\)이나 CSV/);
  sheetError(new Uint8Array(Buffer.from("<html><table></table></html>")), /엑셀\(\.xlsx\)이나 CSV/);
  sheetError(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9]), /다시 내려받아/);
  const unknown = parseApplicantSheet(new Uint8Array(Buffer.from("foo,bar\n1,2\n")));
  assert.equal(unknown.headerRow, 0);
  assert.deepEqual(unknown.unknownHeaders, ["foo", "bar"]);
  assert.equal(unknown.rows.length, 0);
  assert.equal(unknown.skipped[0].line, 1);
});

test("the people limit keeps counting the rest", () => {
  const csv = ["Email", "a@example.com", "b@example.com", "c@example.com"].join("\n");
  const parsed = parseApplicantSheet(new Uint8Array(Buffer.from(csv)), { limit: 2 });
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.totalRows, 3);
  assert.equal(parsed.skipped[0].line, 4);
});
