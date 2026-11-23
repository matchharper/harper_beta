import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDID_ADDRESS_PATTERN, DB_PROFILE_LABEL, candidAddresses, candidContactUrl, candidSourceRef, dbCandidates, dbCurrentCompany,
  dbMailAddress, dbProfileText, isPlaceholderAddress, isRoleAddress, mxVerdictOf, pickDbCandidates, settleMxVerdicts,
  type CandidExperience, type CandidRow, type MxVerdict,
} from "./dbSource";
import { PROFILE_TEXT_CHARS } from "./profile";

const row = (over: Partial<CandidRow> = {}): CandidRow => ({
  id: "00000000-0000-4000-8000-000000000001", name: "Jane Doe", headline: "Backend engineer", location: "Seoul, South Korea",
  linkedinUrl: null, email: "jane.doe@gmail.com", links: null, summary: null, bio: null, ...over,
});

test("the SQL pre-filter finds a personal address in either form of the email column", () => {
  const pattern = new RegExp(CANDID_ADDRESS_PATTERN, "i");
  assert.ok(pattern.test("jane.doe@gmail.com"));
  assert.ok(pattern.test('["jane@school.ac.kr","Jane.Doe@Naver.com"]'));
  assert.ok(!pattern.test("jane@gmail.com.example"));
  assert.ok(!pattern.test("jane@company.co.kr"));
  assert.ok(!pattern.test("[]"));
});

test("the email column is one address or a JSON array of them", () => {
  assert.deepEqual(candidAddresses("Jane.Doe@Gmail.com "), ["jane.doe@gmail.com"]);
  assert.deepEqual(candidAddresses('["a@school.ac.kr", "b@gmail.com", "b@gmail.com"]'), ["a@school.ac.kr", "b@gmail.com"]);
  assert.deepEqual(candidAddresses('["a@school.ac.kr", "b@gmail.com"'), ["a@school.ac.kr", "b@gmail.com"]);
  assert.deepEqual(candidAddresses("a@x.com; b@naver.com"), ["a@x.com", "b@naver.com"]);
  assert.deepEqual(candidAddresses("[]"), []);
  assert.deepEqual(candidAddresses('[""]'), []);
  assert.deepEqual(candidAddresses(null), []);
});

test("only a personal mailbox of a person is mailed: no work, school, role, placeholder or Harper address", () => {
  assert.equal(dbMailAddress('["jane@school.ac.kr","jane.doe@gmail.com"]'), "jane.doe@gmail.com");
  assert.equal(dbMailAddress("jane@company.co.kr"), null);
  assert.equal(dbMailAddress("jane@matchharper.com"), null);
  assert.equal(dbMailAddress('["info@gmail.com","jane.doe@naver.com"]'), "jane.doe@naver.com");
  assert.equal(dbMailAddress("test@gmail.com"), null);
  assert.equal(dbMailAddress("your.email@gmail.com"), null);
  assert.equal(dbMailAddress("aaaa@naver.com"), null);
  assert.equal(dbMailAddress("1234@naver.com"), null);
  assert.ok(isRoleAddress("no-reply@gmail.com") && isRoleAddress("recruit@naver.com"));
  assert.ok(!isRoleAddress("jane.recruit@naver.com"));
  assert.ok(isPlaceholderAddress("example1@gmail.com") && !isPlaceholderAddress("jdoe1990@gmail.com"));
});

test("a domain takes mail only with a real MX host; a failed lookup is unknown, not none", () => {
  assert.equal(mxVerdictOf({ records: [{ exchange: "mx1.example-mail.com" }] }), "ok");
  assert.equal(mxVerdictOf({ records: [{ exchange: "." }] }), "none");
  assert.equal(mxVerdictOf({ records: [] }), "none");
  assert.equal(mxVerdictOf({ errorCode: "ENODATA" }), "none");
  assert.equal(mxVerdictOf({ errorCode: "ENOTFOUND" }), "none");
  for (const code of ["ETIMEOUT", "ESERVFAIL", "ECONNREFUSED", "EREFUSED", null]) assert.equal(mxVerdictOf({ errorCode: code }), "unknown");
});

test("no domain counts as taking no mail while none resolved at all (no DNS)", () => {
  const all = (verdicts: Record<string, MxVerdict>) => Object.fromEntries(settleMxVerdicts(new Map(Object.entries(verdicts))));
  assert.deepEqual(all({ "gmail.com": "none", "naver.com": "none" }), { "gmail.com": "unknown", "naver.com": "unknown" });
  assert.deepEqual(all({ "gmail.com": "ok", "korea.com": "none" }), { "gmail.com": "ok", "korea.com": "none" });
});

test("a row's keys are its address, its LinkedIn profile and its own page; its contact page is a platform profile", () => {
  const [candidate] = dbCandidates([row({
    linkedinUrl: "https://kr.linkedin.com/in/jane-doe-1a2b/", links: ["https://img.shields.io/badge/x", "github.com/janedoe/janedoe", "https://janedoe.github.io/"],
  })]);
  assert.equal(candidate.email, "jane.doe@gmail.com");
  assert.equal(candidate.profileUrl, "https://www.linkedin.com/in/jane-doe-1a2b");
  assert.equal(candidate.contactUrl, "https://github.com/janedoe");
  assert.equal(candidate.personKey, "email:jane.doe@gmail.com");
  assert.ok(candidate.keys.includes("url:linkedin.com/in/jane-doe-1a2b"));
  assert.ok(candidate.keys.includes("url:github.com/janedoe"));
  assert.equal(candidContactUrl(["https://www.linkedin.com/in/jane", "https://example.dev/about"]), null);
  assert.deepEqual(dbCandidates([row({ email: "jane@company.co.kr" })]), []);
  assert.equal(candidSourceRef("abc"), "candid:abc");
});

test("the walk takes up to the room, skips known people, repeats and dead domains, and stops at an unchecked domain", () => {
  const rows = [
    row({ id: "1", email: "a.one@gmail.com" }),
    row({ id: "2", email: "b.two@gmail.com" }),
    row({ id: "3", email: "a.one@gmail.com" }),
    row({ id: "4", email: "c.three@korea.com" }),
    row({ id: "5", email: "d.four@naver.com" }),
    row({ id: "6", email: "e.five@daum.net" }),
    row({ id: "7", email: "f.six@gmail.com" }),
  ];
  const candidates = dbCandidates(rows);
  const mx = new Map<string, MxVerdict>([["gmail.com", "ok"], ["korea.com", "none"], ["naver.com", "ok"], ["daum.net", "unknown"]]);
  const known = new Set(["email:b.two@gmail.com"]);
  const all = pickDbCandidates(candidates, { room: 10, known, mx });
  assert.deepEqual(all.picked.map((item) => item.row.id), ["1", "5"]);
  assert.equal(all.stopped, true);
  assert.deepEqual(all.skipped, { known: 1, duplicate: 1, noMx: 1 });
  const one = pickDbCandidates(candidates, { room: 1, known, mx });
  assert.deepEqual(one.picked.map((item) => item.row.id), ["1"]);
  assert.equal(one.stopped, false);
  assert.equal(pickDbCandidates(candidates, { room: 0, known, mx }).picked.length, 0);
});

const job = (over: Partial<CandidExperience>): CandidExperience => ({
  company: "Example Corp", role: "Engineer", description: null, months: 12, startDate: "2020-01-01", endDate: "2021-01-01", ...over,
});

test("the current company is the latest role without an end", () => {
  assert.equal(dbCurrentCompany([job({ company: "Old Co" }), job({ company: "Now Co", endDate: null, startDate: "2022-03-01" })]), "Now Co");
  assert.equal(dbCurrentCompany([job({ company: "Old Co" })]), null);
  assert.equal(dbCurrentCompany([]), null);
});

test("the profile text: summary, then experience newest first, then education, without contact details", () => {
  const text = dbProfileText(
    { headline: "Backend engineer", summary: "Builds payment systems. Call 010-1234-5678 or jane.doe@gmail.com", bio: "Likes Go and Kotlin." },
    [
      job({ company: "Old Co", role: "Junior developer", startDate: "2016-02-01", endDate: "2019-01-01", months: 35 }),
      job({ company: "Now Co", role: "Senior backend engineer", startDate: "2021-03-01", endDate: null, months: 32, description: "Led the ledger service https://example.com/x" }),
    ],
    [{ school: "Example University", degree: "BS", field: "Computer Science", startDate: "2010-03-01", endDate: "2014-02-01" }],
  ) ?? "";
  const lines = text.split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith(`${DB_PROFILE_LABEL.about}: Backend engineer · Builds payment systems.`));
  assert.ok(lines[0].includes("Likes Go and Kotlin."));
  assert.ok(lines[1].startsWith(`${DB_PROFILE_LABEL.experience}: Now Co · Senior backend engineer · 32 months (2021-03 – present): Led the ledger service`));
  assert.ok(lines[1].indexOf("Old Co") > lines[1].indexOf("Now Co"));
  assert.equal(lines[2], `${DB_PROFILE_LABEL.education}: Example University · BS, Computer Science (2010–2014)`);
  assert.ok(!/010-1234|@gmail|https?:/.test(text));
});

test("a long career stays within the limit and keeps the education", () => {
  const long = "Shipped many things across many teams. ".repeat(40);
  const jobs = Array.from({ length: 12 }, (_, index) => job({ company: `Company ${index}`, description: long, startDate: `20${10 + index}-01-01` }));
  const text = dbProfileText({ headline: "Engineer", summary: long, bio: long }, jobs, [{ school: "Example University", degree: null, field: null, startDate: null, endDate: null }]) ?? "";
  assert.ok(text.length <= PROFILE_TEXT_CHARS);
  assert.ok(text.includes(`${DB_PROFILE_LABEL.education}: Example University`));
  assert.ok(text.indexOf("Company 11") < text.indexOf("Company 10"));
  assert.equal(dbProfileText({ headline: null, summary: null, bio: null }, [], []), null);
});
