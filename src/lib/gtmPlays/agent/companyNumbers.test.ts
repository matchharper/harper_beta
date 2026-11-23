import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPANY_SEARCH_NOTE, CUSTOMER_COLUMNS, CUSTOMER_UNIT, inSourcingColumn, OUTSIDE_COLUMNS, OUTSIDE_UNIT, SOURCING_COLUMNS, sourcingWayOf, tallyCompanyNumbers, tallySourcing, type CompanyCellUnit, type CompanyNumbersInput, type CompanyPostingRef,
  type CompanyTable, type SourcingMail, type SourcingRowInput,
} from "./companyNumbers";

const EMPTY: CompanyNumbersInput = { people: [], companyMails: [], relays: [], introRequests: [], harper: [] };

const outsidePosting = (company: string, url: string): CompanyPostingRef => ({ kind: "external", roleId: null, url, companyName: company });
const customerPosting = (company: string, roleId: string, workspaceId: string, workspaceName: string | null = null): CompanyPostingRef => ({
  kind: "customer", roleId, url: `https://example.com/jobs/${roleId}`, companyName: company, workspaceId, workspaceName,
});
const mail = (id: string, companyName: string, personIds: string[], patch: Partial<CompanyNumbersInput["companyMails"][number]> = {}) => ({
  id, companyName, personIds, clicked: false, replied: false, signedUp: false, deliveryStatus: null, unsubscribed: false, ...patch,
});

/** Every cell's number is its people (people cells), or its mails / messages with the people behind them. */
function assertCellsMatch<C extends string>(numbers: CompanyTable<C>, columns: readonly C[], unit: Record<C, CompanyCellUnit>, people: Set<string>) {
  for (const row of [{ name: "합계", cells: numbers.total }, ...numbers.companies]) {
    for (const column of columns) {
      const cell = row.cells[column];
      assert.equal(new Set(cell.ids).size, cell.ids.length, `${row.name} ${column}: ids once each`);
      for (const id of cell.ids) assert.ok(people.has(id), `${row.name} ${column}: ${id} is one of the period's candidates`);
      if (unit[column] === "people") assert.equal(cell.n, cell.ids.length, `${row.name} ${column}`);
      else assert.equal(cell.n === 0, cell.ids.length === 0, `${row.name} ${column}: a mail or message has its people`);
    }
  }
}

/** 합계 is the sum of the company rows for mails and messages, and the people of all rows (once each) for people. */
function assertTotals<C extends string>(numbers: CompanyTable<C>, columns: readonly C[], unit: Record<C, CompanyCellUnit>) {
  for (const column of columns) {
    const union = new Set(numbers.companies.flatMap((row) => row.cells[column].ids));
    assert.deepEqual(numbers.total[column].ids, [...union].sort(), column);
    if (unit[column] !== "people") {
      assert.equal(numbers.total[column].n, numbers.companies.reduce((sum, row) => sum + row.cells[column].n, 0), column);
    }
  }
}

test("empty input: no company rows and a 합계 of zeros", () => {
  const numbers = tallyCompanyNumbers(EMPTY);
  assert.deepEqual(numbers.outside.companies, []);
  assert.deepEqual(numbers.customers.companies, []);
  for (const column of OUTSIDE_COLUMNS) assert.deepEqual(numbers.outside.total[column], { n: 0, ids: [] });
  for (const column of CUSTOMER_COLUMNS) assert.deepEqual(numbers.customers.total[column], { n: 0, ids: [] });
});

test("하퍼 밖 회사: mails once each, candidates once per company and once in 합계, rows only with a company mail", () => {
  const input: CompanyNumbersInput = {
    ...EMPTY,
    people: [
      { personId: "p1", postings: [outsidePosting("회사 A", "https://a.example.com/job/1"), outsidePosting("회사 B (주)", "https://b.example.com/job/2")] },
      { personId: "p2", postings: [outsidePosting("회사 A", "https://a.example.com/job/1/")] },
      { personId: "p3", postings: [outsidePosting("회사 A", "https://a.example.com/job/1"), outsidePosting("회사 D", "https://d.example.com/1")] },
    ],
    companyMails: [
      mail("m1", "회사 A", ["p1"], { clicked: true, replied: true, signedUp: true }),
      // A second day's mail in the same thread, about p1 again and another candidate.
      mail("m2", "회사 A", ["p1", "p3", "other"], { clicked: true }),
      mail("m3", "회사 B", ["p1"], { deliveryStatus: "bounced", unsubscribed: true }),
      // About no candidate of the period: not this panel's.
      mail("m4", "회사 C", ["other"], { deliveryStatus: "complained" }),
    ],
    relays: [{ personId: "p1", companyName: "회사 A" }, { personId: "other", companyName: "회사 A" }],
    introRequests: [
      { personId: "p1", companyName: "회사 B", connected: true },
      { personId: "p3", companyName: "회사 A", connected: false },
      { personId: "other", companyName: "회사 A", connected: true },
    ],
  };
  const { outside } = tallyCompanyNumbers(input);
  // 회사 D only had its posting mailed: in 합계's 공고 받은 후보, not a row. Rows by 회사 메일.
  assert.deepEqual(outside.companies.map((row) => row.name), ["회사 A", "회사 B (주)"]);
  const [a, b] = outside.companies;
  assert.deepEqual(a.cells.received, { n: 3, ids: ["p1", "p2", "p3"] });
  // Two mails; p1 was in both.
  assert.deepEqual(a.cells.mails, { n: 2, ids: ["p1", "p3"] });
  assert.deepEqual(a.cells.clicked, { n: 2, ids: ["p1", "p3"] });
  assert.deepEqual(a.cells.answered, { n: 1, ids: ["p1"] });
  assert.deepEqual(a.cells.signedUp, { n: 1, ids: ["p1"] });
  assert.deepEqual(a.cells.relayed, { n: 1, ids: ["p1"] });
  assert.deepEqual(a.cells.companyRequested, { n: 1, ids: ["p3"] });
  assert.deepEqual(a.cells.connected, { n: 0, ids: [] });
  // "회사 B (주)" and "회사 B" are one company (agent/match.ts companyKey).
  assert.deepEqual(b.cells.received, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.mails, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.bounced, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.unsubscribed, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.companyRequested, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.connected, { n: 1, ids: ["p1"] });
  assert.deepEqual(outside.total.received, { n: 3, ids: ["p1", "p2", "p3"] });
  assert.deepEqual(outside.total.mails, { n: 3, ids: ["p1", "p3"] });
  assert.deepEqual(outside.total.complained, { n: 0, ids: [] });
  const people = new Set(input.people.map((person) => person.personId));
  assertCellsMatch(outside, OUTSIDE_COLUMNS, OUTSIDE_UNIT, people);
  // 합계's 공고 받은 후보 also holds candidates of companies that are not rows (회사 D), so only the mail columns add up.
  assertTotals(outside, OUTSIDE_COLUMNS.filter((column) => column !== "received"), OUTSIDE_UNIT);
});

test("하퍼 밖 회사: a customer's or Harper's own posting is not an outside company's", () => {
  const { outside } = tallyCompanyNumbers({
    ...EMPTY,
    people: [{ personId: "p1", postings: [customerPosting("고객사 A", "r1", "w1"), { ...outsidePosting("하퍼", "https://example.com/gtm"), kind: "gtm" }] }],
  });
  assert.deepEqual(outside.companies, []);
  assert.deepEqual(outside.total.received, { n: 0, ids: [] });
});

test("하퍼 고객사: by workspace, messages once per account and Role, 합계 the sum of the rows", () => {
  const input: CompanyNumbersInput = {
    ...EMPTY,
    people: [
      // Two customers' postings in one mail: in both rows, once in 합계.
      { personId: "p1", postings: [customerPosting("고객사 A", "r1", "w1", "고객사 A 주식회사"), customerPosting("고객사 B", "r2", "w2"), outsidePosting("회사 C", "https://c.example.com/1")] },
      // Two Roles of one customer (one under an anonymous name): one company, one person.
      { personId: "p2", postings: [customerPosting("고객사 A", "r1", "w1"), customerPosting("익명 고객사", "r3", "w1")] },
      // The same Harper account found twice (two person rows) with the same Role.
      { personId: "p3", postings: [customerPosting("고객사 A", "r1", "w1")] },
      { personId: "p4", postings: [customerPosting("고객사 A", "r1", "w1")] },
    ],
    harper: [
      { personId: "p1", talentId: "t1", roleId: "r1", interested: true, told: true, answered: true, companyRequested: true, connected: true, toCompany: 3, toTalent: 2 },
      { personId: "p1", talentId: "t1", roleId: "r2", interested: true, told: false, answered: false, companyRequested: false, connected: false, toCompany: 0, toTalent: 0 },
      { personId: "p2", talentId: "t2", roleId: "r3", interested: false, told: true, answered: false, companyRequested: true, connected: false, toCompany: 1, toTalent: 0 },
      { personId: "p3", talentId: "t3", roleId: "r1", interested: true, told: true, answered: true, companyRequested: false, connected: false, toCompany: 2, toTalent: 1 },
      { personId: "p4", talentId: "t3", roleId: "r1", interested: true, told: true, answered: true, companyRequested: false, connected: false, toCompany: 2, toTalent: 1 },
      // Not one of the period's candidates, and a Role none of their mails carried.
      { personId: "other", talentId: "t9", roleId: "r1", interested: true, told: true, answered: true, companyRequested: true, connected: true, toCompany: 5, toTalent: 5 },
      { personId: "p1", talentId: "t1", roleId: "r9", interested: true, told: true, answered: true, companyRequested: true, connected: true, toCompany: 5, toTalent: 5 },
    ],
  };
  const { customers, outside } = tallyCompanyNumbers(input);
  assert.deepEqual(outside.companies, []);
  assert.deepEqual(customers.companies.map((row) => [row.key, row.name, row.registeredName]), [
    ["ws:w1", "고객사 A", "고객사 A 주식회사"], ["ws:w2", "고객사 B", null],
  ]);
  const [a, b] = customers.companies;
  assert.deepEqual(a.cells.received, { n: 4, ids: ["p1", "p2", "p3", "p4"] });
  assert.deepEqual(a.cells.interested, { n: 3, ids: ["p1", "p3", "p4"] });
  assert.deepEqual(a.cells.told, { n: 4, ids: ["p1", "p2", "p3", "p4"] });
  assert.deepEqual(a.cells.companyRequested, { n: 2, ids: ["p1", "p2"] });
  assert.deepEqual(a.cells.answered, { n: 3, ids: ["p1", "p3", "p4"] });
  assert.deepEqual(a.cells.connected, { n: 1, ids: ["p1"] });
  // t1 on r1: 3, t2 on r3: 1, t3 on r1: 2 (counted once for its two person rows).
  assert.deepEqual(a.cells.toCompany, { n: 6, ids: ["p1", "p2", "p3", "p4"] });
  assert.deepEqual(a.cells.toTalent, { n: 3, ids: ["p1", "p3", "p4"] });
  assert.deepEqual(b.cells.received, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.interested, { n: 1, ids: ["p1"] });
  assert.deepEqual(customers.total.received, { n: 4, ids: ["p1", "p2", "p3", "p4"] });
  assert.deepEqual(customers.total.interested, { n: 3, ids: ["p1", "p3", "p4"] });
  assert.deepEqual(customers.total.toCompany, { n: 6, ids: ["p1", "p2", "p3", "p4"] });
  const people = new Set(input.people.map((person) => person.personId));
  assertCellsMatch(customers, CUSTOMER_COLUMNS, CUSTOMER_UNIT, people);
  assertTotals(customers, CUSTOMER_COLUMNS, CUSTOMER_UNIT);
});

test("rows: most first by the first column, then by name", () => {
  const { customers } = tallyCompanyNumbers({
    ...EMPTY,
    people: [
      { personId: "p1", postings: [customerPosting("고객사 B", "r2", "w2")] },
      { personId: "p2", postings: [customerPosting("고객사 C", "r3", "w3"), customerPosting("고객사 A", "r1", "w1")] },
      { personId: "p3", postings: [customerPosting("고객사 C", "r3", "w3")] },
    ],
  });
  assert.deepEqual(customers.companies.map((row) => row.name), ["고객사 C", "고객사 A", "고객사 B"]);
});

test("하퍼 밖 회사: a request that went on as Harper's member request counts once, connected by either path", () => {
  const { outside } = tallyCompanyNumbers({
    ...EMPTY,
    people: [
      { personId: "p1", postings: [outsidePosting("회사 A", "https://a.example.com/1")] },
      { personId: "p2", postings: [outsidePosting("회사 A", "https://a.example.com/1")] },
    ],
    companyMails: [mail("m1", "회사 A", ["p1", "p2"], { signedUp: true })],
    introRequests: [
      // p1: asked on the 외부 후보 card, then (p1 being a member) on Harper, where they connected.
      { personId: "p1", companyName: "회사 A", connected: false },
      { personId: "p1", companyName: "회사 A", connected: true },
      // p2 joined before the company asked: Harper's request only, not connected yet.
      { personId: "p2", companyName: "회사 A", connected: false },
    ],
  });
  const [a] = outside.companies;
  assert.deepEqual(a.cells.companyRequested, { n: 2, ids: ["p1", "p2"] });
  assert.deepEqual(a.cells.connected, { n: 1, ids: ["p1"] });
});

// ---------------------------------------------------------------------------------------------------------------
// 회사 소싱

const sourced = (personId: string, patch: Partial<SourcingRowInput> = {}): SourcingRowInput => ({
  personId, way: "company_search", skipReason: null, mails: [], companyRequested: false, connected: false, costUsd: 0, ...patch,
});
const sent = (patch: Partial<SourcingMail> = {}): SourcingMail => ({
  clicked: false, signedUp: false, replied: false, deliveryStatus: null, unsubscribed: false, ...patch,
});

test("회사 소싱: how a company was found, from its found note", () => {
  assert.equal(sourcingWayOf(`${COMPANY_SEARCH_NOTE} · 백엔드 개발자`), "company_search");
  assert.equal(sourcingWayOf("구직 글 · 구직 신호 점수 80"), "candidate_search");
  assert.equal(sourcingWayOf(null), "candidate_search");
});

test("회사 소싱: every number counts companies, and its ids are exactly the rows the column takes", () => {
  const rows: SourcingRowInput[] = [
    sourced("c1", { mails: [sent({ clicked: true }), sent({ replied: true })], costUsd: 0.2 }),
    sourced("c2", { mails: [sent({ signedUp: true })], companyRequested: true, connected: true, costUsd: 0.1 }),
    sourced("c3", { skipReason: "하퍼 고객사" }),
    sourced("c4", { skipReason: "주소 없음", way: "candidate_search" }),
    sourced("c5", { way: "candidate_search", mails: [sent({ deliveryStatus: "bounced" }), sent({ deliveryStatus: "complained", unsubscribed: true })] }),
    // Skipped once, mailed later: 연락, not 제외.
    sourced("c6", { skipReason: "30일 안에 연락한 회사", mails: [sent()] }),
    // Still being worked on: only 찾음.
    sourced("c7", { way: "candidate_search" }),
    // The same row twice counts once.
    sourced("c7", { way: "candidate_search" }),
  ];
  const { total, rows: lines } = tallySourcing(rows);
  assert.deepEqual(lines.map((line) => line.way), ["company_search", "candidate_search"]);
  const n = (column: (typeof SOURCING_COLUMNS)[number]) => total.cells[column].n;
  assert.deepEqual(
    [n("found"), n("excluded"), n("contacted"), n("clicked"), n("signedUp"), n("companyRequested"), n("connected"), n("replied")],
    [7, 2, 4, 2, 1, 1, 1, 1],
  );
  assert.deepEqual([n("bounced"), n("complained"), n("unsubscribed")], [1, 1, 1]);
  assert.deepEqual(total.excludedBy, { "하퍼 고객사": 1, "주소 없음": 1 });
  assert.equal(total.costUsd, 0.3);
  const unique = [...new Map(rows.map((row) => [row.personId, row])).values()];
  for (const line of [total, ...lines]) {
    const mine = unique.filter((row) => line.way === null || row.way === line.way);
    for (const column of SOURCING_COLUMNS) {
      const ids = mine.filter((row) => inSourcingColumn(column, row)).map((row) => row.personId).sort();
      assert.deepEqual(line.cells[column].ids, ids, `${line.way} ${column}`);
      assert.equal(line.cells[column].n, ids.length, `${line.way} ${column}`);
    }
  }
  // The two ways split the 합계.
  for (const column of SOURCING_COLUMNS) {
    assert.equal(lines.reduce((sum, line) => sum + line.cells[column].n, 0), total.cells[column].n, column);
  }
});

test("회사 소싱: no hiring post in the period gives no rows and a 합계 of zeros", () => {
  const { total, rows } = tallySourcing([]);
  assert.deepEqual(rows, []);
  for (const column of SOURCING_COLUMNS) assert.deepEqual(total.cells[column], { n: 0, ids: [] });
});
