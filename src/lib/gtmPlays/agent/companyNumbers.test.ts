import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_COLUMNS, CUSTOMER_UNIT, OUTSIDE_COLUMNS, OUTSIDE_UNIT, tallyCompanyNumbers, type CompanyCellUnit, type CompanyNumbersInput,
  type CompanyPostingRef, type CompanyTable,
} from "./companyNumbers";
import type { InterestSignal } from "./conversation";

const EMPTY: CompanyNumbersInput = { people: [], signals: [], companyMails: [], relays: [], introRequests: [], harper: [] };

const outsidePosting = (company: string, url: string): CompanyPostingRef => ({ kind: "external", roleId: null, url, companyName: company });
const customerPosting = (company: string, roleId: string, workspaceId: string, workspaceName: string | null = null): CompanyPostingRef => ({
  kind: "customer", roleId, url: `https://example.com/jobs/${roleId}`, companyName: company, workspaceId, workspaceName,
});
const signal = (personId: string, postingUrl: string, patch: Partial<InterestSignal> = {}): InterestSignal => ({
  personId, postingUrl, companyName: "", postingTitle: "Engineer", question: null, summaryConsent: false,
  at: "2026-11-20T00:00:00.000Z", messageId: `msg-${personId}-${postingUrl}`, ...patch,
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

test("하퍼 밖 회사: a candidate interested in two companies is in both rows and once in 합계", () => {
  const input: CompanyNumbersInput = {
    ...EMPTY,
    people: [
      { personId: "p1", postings: [outsidePosting("회사 A", "https://a.example.com/job/1"), outsidePosting("회사 B (주)", "https://b.example.com/job/2")] },
      { personId: "p2", postings: [outsidePosting("회사 A", "https://a.example.com/job/1/")] },
      { personId: "p3", postings: [outsidePosting("회사 A", "https://a.example.com/job/1")] },
    ],
    signals: [
      signal("p1", "https://a.example.com/job/1", { summaryConsent: true }),
      signal("p1", "https://b.example.com/job/2"),
      // The latest signal on a posting is the person's consent (agent/companyMail.ts interestByPosting).
      signal("p2", "https://a.example.com/job/1", { summaryConsent: true, at: "2026-11-19T00:00:00.000Z" }),
      signal("p2", "https://a.example.com/job/1", { summaryConsent: false, at: "2026-11-21T00:00:00.000Z" }),
      // Not one of the period's candidates (found earlier, or a test person): never counted.
      signal("other", "https://a.example.com/job/1", { summaryConsent: true }),
    ],
    companyMails: [
      mail("m1", "회사 A", ["p1"], { clicked: true, replied: true, signedUp: true }),
      // A second day's mail in the same thread, about another candidate.
      mail("m2", "회사 A", ["p3", "other"], { clicked: true }),
      mail("m3", "회사 B", ["p1"], { deliveryStatus: "bounced", unsubscribed: true }),
      // About no candidate of the period: not this panel's.
      mail("m4", "회사 C", ["other"], { deliveryStatus: "complained" }),
    ],
    relays: [{ personId: "p1", companyName: "회사 A" }, { personId: "other", companyName: "회사 A" }],
    introRequests: [{ personId: "p1", companyName: "회사 B" }],
  };
  const { outside } = tallyCompanyNumbers(input);
  assert.deepEqual(outside.companies.map((row) => row.name), ["회사 A", "회사 B (주)"]);
  const [a, b] = outside.companies;
  assert.deepEqual(a.cells.interested, { n: 2, ids: ["p1", "p2"] });
  assert.deepEqual(a.cells.agreed, { n: 1, ids: ["p1"] });
  assert.deepEqual(a.cells.mails, { n: 2, ids: ["p1", "p3"] });
  assert.deepEqual(a.cells.clicked, { n: 2, ids: ["p1", "p3"] });
  assert.deepEqual(a.cells.replied, { n: 1, ids: ["p1"] });
  assert.deepEqual(a.cells.signedUp, { n: 1, ids: ["p1"] });
  assert.deepEqual(a.cells.relayed, { n: 1, ids: ["p1"] });
  // "회사 B (주)" and "회사 B" are one company (agent/match.ts companyKey).
  assert.deepEqual(b.cells.interested, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.mails, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.bounced, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.unsubscribed, { n: 1, ids: ["p1"] });
  assert.deepEqual(b.cells.introRequested, { n: 1, ids: ["p1"] });
  assert.deepEqual(outside.total.interested, { n: 2, ids: ["p1", "p2"] });
  assert.deepEqual(outside.total.mails, { n: 3, ids: ["p1", "p3"] });
  assert.deepEqual(outside.total.complained, { n: 0, ids: [] });
  const people = new Set(input.people.map((person) => person.personId));
  assertCellsMatch(outside, OUTSIDE_COLUMNS, OUTSIDE_UNIT, people);
  assertTotals(outside, OUTSIDE_COLUMNS, OUTSIDE_UNIT);
});

test("하퍼 밖 회사: interest in a customer's or Harper's own posting is not an outside company's", () => {
  const { outside } = tallyCompanyNumbers({
    ...EMPTY,
    people: [{ personId: "p1", postings: [customerPosting("고객사 A", "r1", "w1"), { ...outsidePosting("하퍼", "https://example.com/gtm"), kind: "gtm" }] }],
    signals: [signal("p1", "https://example.com/jobs/r1", { summaryConsent: true }), signal("p1", "https://example.com/gtm")],
  });
  assert.deepEqual(outside.companies, []);
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
      { personId: "p1", talentId: "t1", roleId: "r1", interested: true, requested: true, answered: true, connected: true, toCompany: 3, toTalent: 2 },
      { personId: "p1", talentId: "t1", roleId: "r2", interested: true, requested: false, answered: false, connected: false, toCompany: 0, toTalent: 0 },
      { personId: "p2", talentId: "t2", roleId: "r3", interested: false, requested: true, answered: false, connected: false, toCompany: 1, toTalent: 0 },
      { personId: "p3", talentId: "t3", roleId: "r1", interested: true, requested: true, answered: true, connected: false, toCompany: 2, toTalent: 1 },
      { personId: "p4", talentId: "t3", roleId: "r1", interested: true, requested: true, answered: true, connected: false, toCompany: 2, toTalent: 1 },
      // Not one of the period's candidates, and a Role none of their mails carried.
      { personId: "other", talentId: "t9", roleId: "r1", interested: true, requested: true, answered: true, connected: true, toCompany: 5, toTalent: 5 },
      { personId: "p1", talentId: "t1", roleId: "r9", interested: true, requested: true, answered: true, connected: true, toCompany: 5, toTalent: 5 },
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
  assert.deepEqual(a.cells.requested, { n: 4, ids: ["p1", "p2", "p3", "p4"] });
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
